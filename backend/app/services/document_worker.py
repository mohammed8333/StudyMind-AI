import os
import json
import asyncio
import logging
from typing import Set, Dict, Optional, List
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.services.document_processor import document_processor
from app.services.vector_store import get_embedding

logger = logging.getLogger(__name__)

INTERRUPTED_STATUSES = ["PENDING", "UPLOADING", "PROCESSING", "OCR", "INDEXING", "uploading", "extracting", "indexing"]

class DocumentWorker:
    """
    Persistent Database-Backed Asynchronous Queue & Background Worker for Document Processing.
    
    Architecture:
    1. Fast in-memory dispatch using asyncio.Queue
    2. Event-loop aware: safely adapts to current running loop in both production and test environments
    3. Idempotency lock via _active_jobs set preventing duplicate processing
    4. Persistent database state tracking (PENDING -> PROCESSING -> OCR -> INDEXING -> READY / FAILED)
    5. Auto-recovery of interrupted jobs on application startup
    6. Fine-grained real-time progress percentage & Arabic stage updates
    """

    def __init__(self, concurrency: int = 2):
        self.concurrency = concurrency
        self.queue: Optional[asyncio.Queue] = None
        self._active_jobs: Set[int] = set()
        self._worker_tasks: List[asyncio.Task] = []
        self._events: Dict[int, asyncio.Event] = {}
        self._is_running = False
        self._loop = None

    def ensure_started(self):
        """Starts worker tasks in the current running event loop if not already running."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if (
            not self._is_running
            or self._loop != current_loop
            or any(t.done() for t in self._worker_tasks)
            or not self._worker_tasks
        ):
            self.start_workers()

    def start_workers(self):
        """Creates the worker tasks bound to the current running event loop."""
        # Cancel any stale tasks from previous loop
        for task in self._worker_tasks:
            if not task.done():
                task.cancel()
        self._worker_tasks.clear()

        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = asyncio.get_event_loop()

        self.queue = asyncio.Queue()
        self._events.clear()
        self._is_running = True

        for i in range(self.concurrency):
            task = self._loop.create_task(self._worker_loop(i), name=f"doc_worker_{i}")
            self._worker_tasks.append(task)
        logger.info(f"DocumentWorker started {len(self._worker_tasks)} background worker tasks on loop {id(self._loop)}.")

    async def start(self):
        """Application startup hook: start workers and recover interrupted jobs."""
        self.start_workers()
        await self.recover_interrupted_jobs()

    async def stop(self):
        """Application shutdown hook: cleanly stops worker tasks."""
        self._is_running = False
        for task in self._worker_tasks:
            task.cancel()
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        self._worker_tasks.clear()
        self._active_jobs.clear()
        self._events.clear()
        logger.info("DocumentWorker successfully stopped.")

    async def enqueue_document(self, document_id: int) -> bool:
        """
        Enqueues a document for background processing.
        Prevents duplicate enqueuing if the document is currently active.
        """
        self.ensure_started()
        if document_id in self._active_jobs:
            logger.warning(f"Document {document_id} is already active or in progress. Skipping duplicate enqueue.")
            return False

        if document_id not in self._events:
            self._events[document_id] = asyncio.Event()
        else:
            self._events[document_id].clear()

        await self.queue.put(document_id)
        logger.info(f"Document {document_id} enqueued for background processing.")
        return True

    async def retry_document(self, document_id: int) -> bool:
        """
        Resets a failed document's status and enqueues it for re-processing.
        """
        if document_id in self._active_jobs:
            return False

        async with AsyncSessionLocal() as db:
            doc = await db.get(Document, document_id)
            if not doc:
                return False

            doc.status = "PENDING"
            doc.progress_percentage = 0
            doc.progress_stage = "في قائمة الانتظار (إعادة المحاولة)"
            doc.error_message = None
            doc.retry_count = (doc.retry_count or 0) + 1
            await db.commit()

        return await self.enqueue_document(document_id)

    async def recover_interrupted_jobs(self):
        """
        Finds any documents left in intermediate/unfinished states after a server restart,
        resets their state to PENDING, and enqueues them for processing.
        """
        try:
            async with AsyncSessionLocal() as db:
                stmt = select(Document.id).where(Document.status.in_(INTERRUPTED_STATUSES))
                res = await db.execute(stmt)
                interrupted_ids = res.scalars().all()

            if interrupted_ids:
                logger.info(f"Recovering {len(interrupted_ids)} interrupted document processing jobs: {interrupted_ids}")
                for doc_id in interrupted_ids:
                    async with AsyncSessionLocal() as db:
                        doc = await db.get(Document, doc_id)
                        if doc:
                            doc.status = "PENDING"
                            doc.progress_percentage = 5
                            doc.progress_stage = "جاري استئناف المعالجة بعد إعادة تشغيل الخادم..."
                            await db.commit()
                    await self.enqueue_document(doc_id)
            else:
                logger.info("No interrupted document jobs found on startup.")
        except Exception as e:
            logger.error(f"Error during recover_interrupted_jobs: {e}", exc_info=True)

    async def wait_for_document(self, document_id: int, timeout: float = 30.0) -> Optional[str]:
        """
        Wait until a specific document reaches a terminal status (READY or FAILED).
        Combines event signaling and database state polling for maximum reliability.
        """
        end_time = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < end_time:
            async with AsyncSessionLocal() as db:
                doc = await db.get(Document, document_id)
                if doc and doc.status and doc.status.upper() in ["READY", "FAILED"]:
                    return doc.status

            event = self._events.get(document_id)
            if event:
                try:
                    await asyncio.wait_for(event.wait(), timeout=0.4)
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.sleep(0.4)

        async with AsyncSessionLocal() as db:
            doc = await db.get(Document, document_id)
            return doc.status if doc else None

    async def _worker_loop(self, worker_id: int):
        """Worker task processing loop."""
        logger.info(f"Worker task #{worker_id} started listening for jobs.")
        while self._is_running:
            try:
                document_id = await self.queue.get()
            except (asyncio.CancelledError, GeneratorExit):
                break

            try:
                if document_id in self._active_jobs:
                    logger.warning(f"Worker #{worker_id}: Document {document_id} already in _active_jobs. Skipping.")
                else:
                    self._active_jobs.add(document_id)
                    try:
                        await self._process_document(document_id)
                    finally:
                        self._active_jobs.discard(document_id)
            except Exception as exc:
                logger.error(f"Worker #{worker_id} unexpected error processing document {document_id}: {exc}", exc_info=True)
            finally:
                self.queue.task_done()
                if document_id in self._events:
                    self._events[document_id].set()

    async def _process_document(self, document_id: int):
        """
        Executes the full pipeline for a document:
        PENDING -> PROCESSING (Extract) -> OCR (if needed) -> INDEXING (Chunk & Embeddings) -> READY / FAILED
        """
        # Fetch document
        async with AsyncSessionLocal() as db:
            doc = await db.get(Document, document_id)
            if not doc:
                logger.error(f"Document {document_id} not found in database.")
                return

            if doc.status and doc.status.upper() == "READY":
                logger.info(f"Document {document_id} is already READY. No processing needed.")
                return

            file_path = doc.file_path
            file_type = doc.file_type or "pdf"

            if not os.path.exists(file_path):
                doc.status = "FAILED"
                doc.progress_percentage = 0
                doc.progress_stage = "فشل: الملف غير موجود على القرص"
                doc.error_message = "ملف المستند غير موجود على مسار التخزين."
                await db.commit()
                return

            # Stage 1: PROCESSING
            doc.status = "PROCESSING"
            doc.progress_percentage = 25
            doc.progress_stage = "جاري قراءة الملف واستخراج النصوص والجداول..."
            doc.error_message = None
            await db.commit()

        # Step 2: Extraction & OCR detection
        try:
            chunks, metadata = document_processor.process(file_path, file_type=file_type)
            total_pages = metadata.get("total_pages", 1)
            used_ocr = metadata.get("ocr_pages_count", 0) > 0

            async with AsyncSessionLocal() as db:
                doc = await db.get(Document, document_id)
                if not doc:
                    return
                doc.total_pages = total_pages

                if used_ocr:
                    doc.status = "OCR"
                    doc.progress_percentage = 50
                    doc.progress_stage = "جاري التعرف الضوئي على الصفحات الممسوحة (OCR)..."
                    await db.commit()

                # Handle empty documents
                if not chunks:
                    if metadata.get("ocr_errors"):
                        doc.status = "FAILED"
                        doc.error_message = "فشل التعرف الضوئي على المستند: " + "; ".join(metadata["ocr_errors"][:2])
                        doc.progress_percentage = 100
                        doc.progress_stage = "فشل التعرف الضوئي"
                    else:
                        doc.status = "READY"
                        doc.error_message = "المستند فارغ أو لا يحتوي على نصوص قابلة للقراءة."
                        doc.progress_percentage = 100
                        doc.progress_stage = "جاهز (المستند لا يحتوي على نصوص)"
                    await db.commit()
                    return

                # Stage 3: INDEXING
                doc.status = "INDEXING"
                doc.progress_percentage = 70
                doc.progress_stage = "جاري تجزئة المحتوى وتوليد التضمينات والفهرسة..."
                await db.commit()

            # Clean any previous chunks (important for retry)
            async with AsyncSessionLocal() as db:
                await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
                await db.commit()

            # Step 3: Embeddings & Persistence
            total_chunks = len(chunks)
            for idx, c in enumerate(chunks):
                emb = await get_embedding(c["content"])
                emb_json = json.dumps(emb)

                async with AsyncSessionLocal() as db:
                    chunk_record = DocumentChunk(
                        document_id=document_id,
                        page_number=c["page_number"],
                        chunk_index=c["chunk_index"],
                        chapter=c["chapter"],
                        source_type=c.get("source_type", file_type),
                        content=c["content"],
                        content_normalized=c["content_normalized"],
                        embedding_json=emb_json
                    )
                    db.add(chunk_record)

                    # Progressively update indexing progress
                    current_pct = 70 + int(((idx + 1) / total_chunks) * 25)
                    doc = await db.get(Document, document_id)
                    if doc:
                        doc.progress_percentage = min(current_pct, 95)
                        doc.progress_stage = f"جاري فهرسة المقطع {idx + 1} من {total_chunks}..."
                    await db.commit()

            # Step 4: Completion (READY)
            async with AsyncSessionLocal() as db:
                doc = await db.get(Document, document_id)
                if doc:
                    doc.status = "READY"
                    doc.progress_percentage = 100
                    doc.progress_stage = "جاهز للدراسة والاختبارات"
                    if metadata.get("ocr_errors"):
                        doc.error_message = f"تمت الفهرسة مع ملاحظات OCR: {'; '.join(metadata['ocr_errors'][:2])}"
                    else:
                        doc.error_message = None
                    await db.commit()
                    logger.info(f"Document {document_id} processed successfully to READY state.")

        except Exception as e:
            logger.error(f"Failed to process and index document {document_id}: {e}", exc_info=True)
            async with AsyncSessionLocal() as db:
                doc = await db.get(Document, document_id)
                if doc:
                    doc.status = "FAILED"
                    doc.progress_percentage = 0
                    doc.progress_stage = "فشلت عملية المعالجة"
                    doc.error_message = f"فشل في معالجة وفهرسة الملف: {str(e)}"
                    await db.commit()

# Singleton worker instance
document_worker = DocumentWorker(concurrency=2)
