from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc
from typing import List, Optional
import json

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.copilot import CopilotMessage
from app.schemas.copilot import (
    StudentLearningStateResponse,
    WhatToStudyNowResponse,
    DailyBriefingResponse,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotMessageItem,
    CopilotRebalanceResponse,
)
from app.services.copilot_engine import (
    aggregate_student_learning_state,
    determine_what_to_study_now,
    generate_daily_briefing,
    execute_copilot_chat,
    rebalance_neglected_tasks,
)

router = APIRouter()

@router.get("/state", response_model=StudentLearningStateResponse)
async def get_student_learning_state_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the real-time aggregated learning state for the authenticated student:
    mastery, weak concepts, exam countdown, today's tasks, overdue alerts, and flashcards.
    """
    return await aggregate_student_learning_state(db, user.id)


@router.get("/next-action", response_model=WhatToStudyNowResponse)
async def get_what_to_study_now_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the single highest-impact study task the student should do right now,
    along with an explicit data-driven rationale and direct action button.
    """
    state = await aggregate_student_learning_state(db, user.id)
    return determine_what_to_study_now(state)


@router.get("/briefing", response_model=DailyBriefingResponse)
async def get_daily_briefing_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates a personalized daily briefing ("Today's Learning Plan"):
    exam countdown, neglect alert, today's tasks agenda, and primary action.
    """
    return await generate_daily_briefing(db, user.id)


@router.post("/chat", response_model=CopilotChatResponse)
async def copilot_chat_endpoint(
    req: CopilotChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Interacts with the AI Learning Copilot. Automatically separates student state
    questions (zero hallucinations) from curriculum questions (RAG search).
    """
    if not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن إرسال رسالة فارغة للمساعد الذكي."
        )

    return await execute_copilot_chat(
        db=db,
        student_id=user.id,
        user_message=req.message.strip(),
        document_id=req.document_id,
        history_limit=req.history_limit
    )


@router.get("/chat/history", response_model=List[CopilotMessageItem])
async def get_copilot_chat_history_endpoint(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns previous conversation history between the student and the Copilot.
    """
    stmt = (
        select(CopilotMessage)
        .where(CopilotMessage.user_id == user.id)
        .order_by(desc(CopilotMessage.id))
        .limit(limit)
    )
    records = list(reversed((await db.execute(stmt)).scalars().all()))

    result: List[CopilotMessageItem] = []
    for r in records:
        payload = None
        if r.action_payload_json:
            try:
                payload = json.loads(r.action_payload_json)
            except Exception:
                payload = None

        citations = None
        if r.citations_json:
            try:
                citations = json.loads(r.citations_json)
            except Exception:
                citations = None

        result.append(
            CopilotMessageItem(
                id=r.id,
                role=r.role,
                content=r.content,
                action_type=r.action_type,
                action_payload=payload,
                citations=citations,
                created_at=r.created_at
            )
        )
    return result


@router.delete("/chat/clear", status_code=status.HTTP_200_OK)
async def clear_copilot_chat_history_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clears the student's conversation history with the Copilot.
    """
    stmt = delete(CopilotMessage).where(CopilotMessage.user_id == user.id)
    await db.execute(stmt)
    await db.commit()
    return {"success": True, "message": "تم مسح سجل المحادثات بنجاح."}


@router.post("/rebalance", response_model=CopilotRebalanceResponse)
async def rebalance_neglected_tasks_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    One-click rebalance for overdue tasks in the student's active study plan.
    """
    return await rebalance_neglected_tasks(db, user.id)
