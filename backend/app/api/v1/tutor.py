import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.models.user import User
from app.models.document import Document
from app.models.chat import ChatMessage
from app.schemas.tutor import (
    TutorAskRequest,
    TutorResponse,
    ChatHistoryResponse,
    ChatMessageRecord,
    SourceCitation
)
from app.api.deps import get_current_user
from app.core.rate_limiter import check_chat_rate_limit
from app.services.rag_engine import generate_tutor_answer, generate_document_summary

router = APIRouter()

@router.get("/history/{document_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve persistent chat conversation history specifically for this student account and document.
    Ensures complete isolation and checks document ownership (IDOR Protection).
    """
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود أو لا تملك صلاحية الوصول إليه."
        )

    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.document_id == document_id
        )
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    messages: List[ChatMessageRecord] = []
    for r in records:
        sources: List[SourceCitation] = []
        if r.sources_json:
            try:
                raw_sources = json.loads(r.sources_json)
                sources = [SourceCitation(**s) for s in raw_sources]
            except Exception:
                sources = []
                
        followups: List[str] = []
        if r.suggested_followups_json:
            try:
                followups = json.loads(r.suggested_followups_json)
            except Exception:
                followups = []
                
        messages.append(ChatMessageRecord(
            id=r.id,
            role=r.role,
            content=r.content,
            explanation_level=r.explanation_level,
            sources=sources,
            suggested_followups=followups,
            created_at=r.created_at
        ))
        
    return ChatHistoryResponse(
        document_id=document_id,
        total_messages=len(messages),
        messages=messages
    )

@router.delete("/history/{document_id}")
async def clear_chat_history(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear chat conversation history for this student and document (IDOR Protection)."""
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود أو لا تملك صلاحية الوصول إليه."
        )

    stmt = delete(ChatMessage).where(
        ChatMessage.user_id == user.id,
        ChatMessage.document_id == document_id
    )
    await db.execute(stmt)
    await db.commit()
    return {"message": "تم مسح سجل المحادثة بنجاح"}

@router.post("/ask", response_model=TutorResponse)
async def ask_tutor(
    req: TutorAskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_chat_rate_limit)
):
    """
    Ask the AI Tutor a question about an uploaded study document.
    Protected with Rate Limiting and IDOR verification.
    """
    doc = await db.get(Document, req.document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند المطلوب غير موجود أو لا تملك صلاحية الوصول إليه."
        )
        
    if doc.status not in ["ready", "indexed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="المستند قيد المعالجة أو حدث خطأ أثناء فهرسته، يرجى الانتظار."
        )
        
    # 1. Save student question to persistent history
    user_chat_msg = ChatMessage(
        user_id=user.id,
        document_id=req.document_id,
        role="user",
        content=req.question,
        explanation_level=req.explanation_level
    )
    db.add(user_chat_msg)
    await db.flush()

    # 2. Generate pedagogical answer
    response = await generate_tutor_answer(
        db=db,
        document_id=req.document_id,
        question=req.question,
        target_page=req.target_page,
        explanation_level=req.explanation_level,
        history=[msg.model_dump() for msg in (req.history or [])]
    )
    
    # 3. Save assistant response with sources and followups to persistent history
    sources_json_str = json.dumps([s.model_dump() for s in response.sources], ensure_ascii=False)
    followups_json_str = json.dumps(response.suggested_followups, ensure_ascii=False)
    
    assistant_chat_msg = ChatMessage(
        user_id=user.id,
        document_id=req.document_id,
        role="assistant",
        content=response.answer,
        explanation_level=response.explanation_level,
        sources_json=sources_json_str,
        suggested_followups_json=followups_json_str
    )
    db.add(assistant_chat_msg)
    await db.commit()
    
    return response

@router.post("/summary/{document_id}")
async def get_document_summary_endpoint(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates a structured, pedagogical AI summary of the document.
    Verifies document ownership to prevent IDOR data leaks.
    """
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند المطلوب غير موجود أو لا تملك صلاحية الوصول إليه."
        )

    res = await generate_document_summary(db=db, document_id=document_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res
