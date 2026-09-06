from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.document import Document
from app.models.exam import Exam, ExamQuestion
from app.schemas.exam import (
    ExamGenerateRequest,
    ExamResponse,
    ExamQuestionPublic,
    ExamAttemptStartResponse,
    ExamSubmitRequest,
    ExamResultResponse,
    ExamHistoryItem
)
from app.services.exam_service import (
    create_exam_for_document,
    start_exam_attempt,
    grade_and_submit_exam_attempt,
    get_exam_attempt_result,
    get_user_exam_history,
    build_attempt_start_response
)
from datetime import datetime
import json
from app.core.rate_limiter import check_exam_rate_limit

router = APIRouter()

@router.post("/generate", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def generate_exam_endpoint(
    req: ExamGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_exam_rate_limit)
):
    """
    Generate an AI Exam strictly grounded in document content.
    Supports MCQ, True/False, and Short Answer with server-aware duration.
    """
    doc = await db.get(Document, req.document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود أو لا تملك صلاحية الوصول إليه."
        )
        
    try:
        exam_res = await create_exam_for_document(db, user.id, req)
        return exam_res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/history/my", response_model=List[ExamHistoryItem])
async def get_my_exam_history_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve complete history of completed or timed out exams for current user."""
    return await get_user_exam_history(db, user.id)

@router.get("/", response_model=List[ExamResponse])
async def list_exams_endpoint(
    document_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all exams created by the student, optionally filtered by document."""
    stmt = (
        select(Exam)
        .options(selectinload(Exam.document), selectinload(Exam.questions))
        .where(Exam.user_id == user.id)
        .order_by(Exam.created_at.desc())
    )
    if document_id:
        stmt = stmt.where(Exam.document_id == document_id)
        
    result = await db.execute(stmt)
    exams = result.scalars().all()
    
    items = []
    for ex in exams:
        try:
            ch = json.loads(ex.chapters_json) if ex.chapters_json else []
        except Exception:
            ch = []
            
        public_qs = []
        for q in (ex.questions or []):
            try:
                opts = json.loads(q.options_json) if q.options_json else None
            except Exception:
                opts = None
            public_qs.append(ExamQuestionPublic(
                id=q.id,
                question_type=q.question_type,
                question_text=q.question_text,
                options=opts,
                marks=q.marks,
                source_page=q.source_page,
                order_index=q.order_index
            ))
            
        items.append(ExamResponse(
            id=ex.id,
            title=ex.title,
            document_id=ex.document_id,
            document_title=ex.document.title if ex.document else "مذكرة",
            subject=ex.subject,
            chapters=ch,
            difficulty=ex.difficulty,
            duration_minutes=ex.duration_minutes,
            total_questions=ex.total_questions,
            total_marks=ex.total_marks,
            passing_score_pct=ex.passing_score_pct,
            is_mock_mode=ex.is_mock_mode,
            created_at=ex.created_at.isoformat(),
            questions=public_qs
        ))
    return items

@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam_endpoint(
    exam_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get exam details with questions for student viewing."""
    stmt = (
        select(Exam)
        .options(selectinload(Exam.document), selectinload(Exam.questions))
        .where(Exam.id == exam_id)
    )
    res = await db.execute(stmt)
    ex = res.scalars().first()
    if not ex:
        raise HTTPException(status_code=404, detail="الامتحان غير موجود.")
    if ex.user_id != user.id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول لهذا الامتحان.")
        
    try:
        ch = json.loads(ex.chapters_json) if ex.chapters_json else []
    except Exception:
        ch = []
        
    public_qs = []
    for q in (ex.questions or []):
        try:
            opts = json.loads(q.options_json) if q.options_json else None
        except Exception:
            opts = None
        public_qs.append(ExamQuestionPublic(
            id=q.id,
            question_type=q.question_type,
            question_text=q.question_text,
            options=opts,
            marks=q.marks,
            source_page=q.source_page,
            order_index=q.order_index
        ))
        
    return ExamResponse(
        id=ex.id,
        title=ex.title,
        document_id=ex.document_id,
        document_title=ex.document.title if ex.document else "مذكرة",
        subject=ex.subject,
        chapters=ch,
        difficulty=ex.difficulty,
        duration_minutes=ex.duration_minutes,
        total_questions=ex.total_questions,
        total_marks=ex.total_marks,
        passing_score_pct=ex.passing_score_pct,
        is_mock_mode=ex.is_mock_mode,
        created_at=ex.created_at.isoformat(),
        questions=public_qs
    )

@router.post("/{exam_id}/start", response_model=ExamAttemptStartResponse)
async def start_exam_attempt_endpoint(
    exam_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Start an exam attempt. Starts the real server countdown timer.
    Resumes active in-progress attempt if within time.
    """
    try:
        return await start_exam_attempt(db, user.id, exam_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل بدء الامتحان: {e}")

@router.post("/{exam_id}/attempts/{attempt_id}/submit", response_model=ExamResultResponse)
async def submit_exam_attempt_endpoint(
    exam_id: int,
    attempt_id: int,
    submit_req: ExamSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits student answers, executes auto-grading across all question types,
    evaluates errors, feeds into Adaptive Learning, and provides instant analytics.
    Enforces server timer and blocks re-submissions.
    """
    try:
        return await grade_and_submit_exam_attempt(
            db=db,
            user_id=user.id,
            exam_id=exam_id,
            attempt_id=attempt_id,
            submit_req=submit_req
        )
    except ValueError as ve:
        err_msg = str(ve)
        status_code = 400 if "مسبقاً" in err_msg else 404
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل تسليم الامتحان: {e}")

@router.get("/{exam_id}/attempts/{attempt_id}", response_model=ExamResultResponse)
async def get_attempt_result_endpoint(
    exam_id: int,
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get full review, score, explanations, and recommendations for a completed attempt."""
    try:
        return await get_exam_attempt_result(db, user.id, exam_id, attempt_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
