from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.user import User
from app.models.document import Document
from app.models.quiz import Quiz, QuizQuestion, StudentSubmission
from app.schemas.quiz import (
    QuizGenerateRequest, 
    QuizResponse, 
    QuestionItem, 
    QuizSubmitRequest, 
    QuizResultResponse,
    QuizHistoryItem,
    DailyChallengeResponse
)
from app.api.deps import get_current_user
from app.services.quiz_generator import generate_quiz_for_document, grade_quiz_submission
import json
from typing import List, Optional

router = APIRouter()

@router.post("/generate", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def generate_quiz(
    req: QuizGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate an AI exam / quiz from the uploaded document, tagged with concepts and source pages.
    """
    doc = await db.get(Document, req.document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستند غير موجود أو لا تملك صلاحية الوصول إليه."
        )
        
    quiz_res = await generate_quiz_for_document(db, req)
    return quiz_res

@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve quiz details and question items."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود.")
        
    doc = await db.get(Document, quiz.document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول لهذا الاختبار.")
        
    stmt = (
        select(QuizQuestion)
        .options(selectinload(QuizQuestion.concept))
        .where(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.id.asc())
    )
    q_res = await db.execute(stmt)
    questions = q_res.scalars().all()
    
    items = []
    for q in questions:
        try:
            options = json.loads(q.options_json) if q.options_json else []
        except Exception:
            options = []
            
        items.append(QuestionItem(
            id=q.id,
            question_type=q.question_type,
            question_text=q.question_text,
            options=options,
            source_page=q.source_page,
            concept_name=q.concept.name if q.concept else None
        ))
        
    return QuizResponse(
        id=quiz.id,
        title=quiz.title,
        document_id=quiz.document_id,
        difficulty=quiz.difficulty,
        total_questions=len(items),
        questions=items
    )

@router.post("/{quiz_id}/submit", response_model=QuizResultResponse)
async def submit_quiz(
    quiz_id: int,
    sub_req: QuizSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit student answers for automatic grading, instant justification,
    and adaptive learning concept mastery updates.
    """
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود.")
        
    result = await grade_quiz_submission(
        db=db,
        quiz_id=quiz_id,
        student_id=user.id,
        submission_req=sub_req
    )
    return result

@router.get("/history/my", response_model=List[QuizHistoryItem])
async def get_my_quiz_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve all quiz submissions and performance history for the current user.
    """
    stmt = (
        select(StudentSubmission)
        .options(selectinload(StudentSubmission.quiz).selectinload(Quiz.document))
        .where(StudentSubmission.student_id == user.id)
        .order_by(StudentSubmission.submitted_at.desc())
    )
    result = await db.execute(stmt)
    submissions = result.scalars().all()
    
    items: List[QuizHistoryItem] = []
    for s in submissions:
        if not s.quiz:
            continue
        doc_title = s.quiz.document.title if s.quiz.document else "مادة دراسية"
        doc_subject = s.quiz.document.subject if s.quiz.document else None
        
        items.append(QuizHistoryItem(
            id=s.id,
            quiz_id=s.quiz_id,
            quiz_title=s.quiz.title,
            document_id=s.quiz.document_id,
            document_title=doc_title,
            subject=doc_subject,
            score=s.score,
            total_questions=s.total_questions,
            percentage=s.percentage,
            passed=s.percentage >= 60.0,
            time_taken_seconds=s.time_taken_seconds,
            submitted_at=s.submitted_at.isoformat() if s.submitted_at else ""
        ))
    return items

@router.get("/challenge/quick", response_model=Optional[DailyChallengeResponse])
async def get_daily_quick_challenge(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns 1 quick question from the user's materials for the Daily 60-Second Challenge.
    """
    from sqlalchemy.sql.expression import func
    stmt = (
        select(QuizQuestion)
        .join(Quiz, QuizQuestion.quiz_id == Quiz.id)
        .join(Document, Quiz.document_id == Document.id)
        .where(Document.owner_id == user.id)
        .options(selectinload(QuizQuestion.quiz).selectinload(Quiz.document))
        .order_by(func.random())
        .limit(1)
    )
    result = await db.execute(stmt)
    q = result.scalars().first()
    if not q:
        return None
        
    try:
        options = json.loads(q.options_json) if q.options_json else []
    except Exception:
        options = []
        
    doc = q.quiz.document if q.quiz and q.quiz.document else None
    return DailyChallengeResponse(
        question_id=q.id,
        question_text=q.question_text,
        options=options,
        correct_answer=q.correct_answer,
        explanation=q.explanation,
        source_page=q.source_page,
        document_title=doc.title if doc else "المادة الدراسية",
        subject=doc.subject if doc else None
    )
