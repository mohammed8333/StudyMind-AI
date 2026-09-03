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
from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.schemas.document import DocumentResponse, DocumentDetailResponse, DocumentChunkResponse
from app.api.deps import get_current_user
from app.services.pdf_extractor import process_and_chunk_pdf
from app.services.vector_store import get_embedding

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
    Upload a study document (PDF), extract Arabic content, chunk, and index it into the Knowledge Base.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="فقط ملفات الـ PDF مدعومة حالياً."
        )
        
    unique_filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    # Save file to disk
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        file_size = len(content)
        await out_file.write(content)
        
    # Create Document record
    doc = Document(
        title=title,
        subject=subject,
        filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        status="processing",
        owner_id=user.id
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    # Process PDF and generate chunks
    try:
        chunks, metadata = process_and_chunk_pdf(file_path)
        doc.total_pages = metadata.get("total_pages", 1)
        
        # Save chunks and embeddings
        for c in chunks:
            # Generate embedding
            emb = await get_embedding(c["content"])
            emb_json = json.dumps(emb)
            
            chunk_record = DocumentChunk(
                document_id=doc.id,
                page_number=c["page_number"],
                chunk_index=c["chunk_index"],
                chapter=c["chapter"],
                content=c["content"],
                content_normalized=c["content_normalized"],
                embedding_json=emb_json
            )
            db.add(chunk_record)
            
        doc.status = "indexed"
        await db.commit()
        await db.refresh(doc)
    except Exception as e:
        doc.status = "error"
        doc.error_message = str(e)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"فشل في معالجة وفهرسة ملف الـ PDF: {str(e)}"
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
