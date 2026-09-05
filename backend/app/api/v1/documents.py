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
    DocumentUpdate,
    DocumentDeleteResponse,
)
from app.api.deps import get_current_user
from app.services.pdf_extractor import process_and_chunk_pdf
from app.services.vector_store import get_embedding
from app.services.file_validator import validate_uploaded_file
from app.services.document_processor import document_processor

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    subject: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a study document (PDF, DOCX, TXT, JPG, PNG), validate its signatures,
    extract content, chunk, and index it into the Knowledge Base.
    """
    content = await file.read()
    
    # 1. Real Backend File Validation (Magic bytes, extension, MIME, size, path traversal)
    safe_filename, file_type = validate_uploaded_file(
        filename=file.filename,
        content=content,
        content_type=file.content_type
    )
    
    unique_filename = f"{uuid.uuid4().hex}_{safe_filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    # Save validated file to disk
    async with aiofiles.open(file_path, 'wb') as out_file:
        await out_file.write(content)
        
    # Create Document record with initial 'uploading' status
    doc = Document(
        title=title,
        subject=subject,
        filename=safe_filename,
        file_path=file_path,
        file_type=file_type,
        file_size=len(content),
        status="uploading",
        owner_id=user.id
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    # 2. Extract & Index document
    try:
        doc.status = "extracting"
        await db.commit()

        # Unified document processor handles PDF, DOCX, TXT, and Images
        chunks, metadata = document_processor.process(file_path, file_type=file_type)
        doc.total_pages = metadata.get("total_pages", 1)
        
        # 3. Indexing state
        doc.status = "indexing"
        await db.commit()

        # Handle documents with no extractable text
        if not chunks:
            if metadata.get("ocr_errors"):
                doc.status = "error"
                doc.error_message = "فشل التعرف الضوئي على المستند: " + "; ".join(metadata["ocr_errors"][:2])
            else:
                doc.status = "ready"
                doc.error_message = "المستند فارغ أو لا يحتوي على نصوص قابلة للقراءة."
            await db.commit()
            await db.refresh(doc)
            return doc
        
        # Save chunks and embeddings
        for c in chunks:
            emb = await get_embedding(c["content"])
            emb_json = json.dumps(emb)
            
            chunk_record = DocumentChunk(
                document_id=doc.id,
                page_number=c["page_number"],
                chunk_index=c["chunk_index"],
                chapter=c["chapter"],
                source_type=c.get("source_type", file_type),
                content=c["content"],
                content_normalized=c["content_normalized"],
                embedding_json=emb_json
            )
            db.add(chunk_record)
            
        doc.status = "ready"
        if metadata.get("ocr_errors"):
            doc.error_message = f"تمت الفهرسة مع ملاحظات OCR: {'; '.join(metadata['ocr_errors'][:2])}"
        else:
            doc.error_message = None

        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        logger.error(f"Failed to process and index document {doc.id}: {e}", exc_info=True)
        doc.status = "error"
        doc.error_message = f"فشل في معالجة وفهرسة الملف: {str(e)}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=doc.error_message
        )
        
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
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
