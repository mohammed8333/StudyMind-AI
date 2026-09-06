from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.core.rate_limiter import check_remedial_rate_limit
from app.schemas.learning import (
    RemedialSessionResponse,
    RemedialSubmitRequest,
    RemedialResultResponse,
    WeakConceptItem
)
from app.services.adaptive_learning import (
    create_or_get_remedial_session,
    submit_remedial_session,
    get_student_weak_concepts
)

router = APIRouter()

@router.post("/remediate/{concept_id}", response_model=RemedialSessionResponse)
async def start_remedial_session(
    concept_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_remedial_rate_limit)
):
    """
    Start a tailored closed-loop remedial session for a specific weak concept.
    Generates:
    - Root cause diagnosis (Knowledge gap, Misconception, Calculation mistake, Careless error).
    - Mini Remedial Lesson grounded strictly in document chunks.
    - 3-5 targeted remedial MCQ questions.
    Verifies concept and document ownership to prevent IDOR.
    """
    try:
        session = await create_or_get_remedial_session(
            db=db,
            student_id=user.id,
            concept_id=concept_id
        )
        return session
    except PermissionError as pe:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(pe)
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"فشل في إنشاء الجلسة العلاجية: {str(e)}"
        )

@router.post("/remediate/{session_id}/submit", response_model=RemedialResultResponse)
async def submit_remedial_answers(
    session_id: int,
    req: RemedialSubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit answers to a remedial session:
    - Evaluates student choices.
    - Recalculates concept mastery (Mastery Before vs Mastery After).
    - Evaluates if student achieved proficiency (is_proficient >= 75%).
    - Updates StudentMastery and session state.
    """
    try:
        result = await submit_remedial_session(
            db=db,
            student_id=user.id,
            session_id=session_id,
            submission_req=req
        )
        return result
    except PermissionError as pe:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(pe)
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"فشل في تصحيح الجلسة العلاجية: {str(e)}"
        )

@router.get("/weak-concepts", response_model=List[WeakConceptItem])
async def list_weak_concepts(
    document_id: Optional[int] = Query(None, description="فلترة حسب معرف المستند"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve all diagnosed weak concepts for the student with their error types and mastery scores.
    """
    weak_concepts = await get_student_weak_concepts(
        db=db,
        student_id=user.id,
        document_id=document_id
    )
    return weak_concepts
