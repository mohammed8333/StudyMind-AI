import os
import uuid
import json
import aiofiles
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.config import settings
import logging
from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.schemas.document import (
    DocumentResponse,
    DocumentDetailResponse,
    DocumentChunkResponse,
    DocumentStatusResponse,
    DocumentUpdate,
    DocumentDeleteResponse,
)
from app.api.deps import get_current_user
from app.core.rate_limiter import check_upload_rate_limit
from app.services.file_validator import stream_and_validate_upload
from app.services.document_worker import document_worker

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    subject: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_upload_rate_limit)
):
    """
    Asynchronous Document Upload:
    Streams uploaded file directly to disk (preventing 50MB RAM buffering),
    validates format/magic bytes, registers document in PENDING state,
    enqueues it for background processing, and returns immediately.
    """
    clean_title = title.strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="عنوان المستند لا يمكن أن يكون فارغاً."
        )

    # 1. Stream file directly to storage & validate signatures
    safe_filename, unique_filename, file_path, file_type, total_size = await stream_and_validate_upload(
        upload_file=file,
        dest_dir=settings.UPLOAD_DIR
    )

    # 2. Create Document record in PENDING state
    doc = Document(
        title=clean_title,
        subject=subject.strip() if subject else None,
        filename=safe_filename,
        file_path=file_path,
        file_type=file_type,
        file_size=total_size,
        status="PENDING",
        progress_percentage=0,
        progress_stage="في قائمة الانتظار",
        retry_count=0,
        owner_id=user.id
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # 3. Queue processing job to background worker
    await document_worker.enqueue_document(doc.id)

    # 4. Return immediately without blocking HTTP connection
    return doc

@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get real-time document processing status, progress percentage, and current stage.
    Protected against IDOR.
    """
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود."
        )
    if doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية للوصول لهذا المستند."
        )
    return doc

@router.post("/{document_id}/retry", response_model=DocumentResponse)
async def retry_document_processing(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retry processing a failed document.
    Verifies ownership (IDOR), prevents duplicate execution if already active,
    resets status to PENDING, and enqueues the document.
    """
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود."
        )
    if doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية لإعادة محاولة معالجة هذا المستند."
        )

    if doc.status.upper() == "READY":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="المستند جاهز ومكتمل بالفعل ولا يحتاج لإعادة المحاولة."
        )

    if document_id in document_worker._active_jobs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="المستند قيد المعالجة حالياً بالفعل في الخلفية."
        )

    # Reset state and enqueue
    doc.status = "PENDING"
    doc.progress_percentage = 0
    doc.progress_stage = "في قائمة الانتظار (إعادة المحاولة)"
    doc.error_message = None
    doc.retry_count = (doc.retry_count or 0) + 1
    await db.commit()
    await db.refresh(doc)

    await document_worker.enqueue_document(doc.id)
    return doc

@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all documents uploaded by the current student."""
    stmt = select(Document).where(Document.owner_id == user.id).order_by(Document.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get specific document details and chunk counts."""
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="المستند غير موجود.")
        
    # Count chunks
    chunk_count_stmt = select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc.id)
    chunk_res = await db.execute(chunk_count_stmt)
    chunks_count = chunk_res.scalar() or 0
    
    return DocumentDetailResponse(
        id=doc.id,
        title=doc.title,
        subject=doc.subject,
        filename=doc.filename,
        file_size=doc.file_size,
        total_pages=doc.total_pages,
        status=doc.status,
        error_message=doc.error_message,
        created_at=doc.created_at,
        chunks_count=chunks_count,
        concepts_count=0
    )

@router.get("/{document_id}/chunks", response_model=List[DocumentChunkResponse])
async def get_document_chunks(
    document_id: int,
    page: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve chunks for a document, optionally filtered by page number."""
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="المستند غير موجود.")
        
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    if page is not None:
        stmt = stmt.where(DocumentChunk.page_number == page)
    stmt = stmt.order_by(DocumentChunk.page_number.asc(), DocumentChunk.chunk_index.asc())
    
    res = await db.execute(stmt)
    return res.scalars().all()

@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    doc_in: DocumentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update / Rename a study document (title, subject).
    Verifies that the current student owns the document (IDOR Protection).
    """
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود."
        )
        
    if doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية لتعديل هذا المستند."
        )
        
    if doc_in.title is not None:
        clean_title = doc_in.title.strip()
        if not clean_title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="عنوان المستند لا يمكن أن يكون فارغاً."
            )
        doc.title = clean_title
        
    if doc_in.subject is not None:
        doc.subject = doc_in.subject.strip() or None
        
    await db.commit()
    await db.refresh(doc)
    return doc

@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
async def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a study document, all associated chunks, concepts, quizzes, and the physical PDF file.
    Verifies that the current student owns the document (IDOR Protection).
    Handles non-existent physical files gracefully without crashing.
    """
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود."
        )
        
    if doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ليس لديك صلاحية لحذف هذا المستند."
        )
        
    # Safe physical storage removal
    if doc.file_path:
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
                logger.info(f"Physical file removed successfully: {doc.file_path}")
            else:
                logger.warning(f"File path does not exist on disk during deletion: {doc.file_path}")
        except Exception as e:
            logger.error(f"Error while removing physical file {doc.file_path}: {e}")
            
    # Delete from database (cascades to chunks, concepts, quizzes, submissions)
    await db.delete(doc)
    await db.commit()
    
    return DocumentDeleteResponse(
        message="تم حذف المستند وجميع محتوياته بنجاح.",
        document_id=document_id
    )
