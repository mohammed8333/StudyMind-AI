from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.user import User
from app.schemas.analytics import StudentAnalyticsResponse
from app.api.deps import get_current_user
from app.services.adaptive_engine import get_student_analytics

router = APIRouter()

@router.get("/dashboard", response_model=StudentAnalyticsResponse)
async def get_dashboard_analytics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve adaptive learning analytics across all documents:
    - Weak Concepts & Strong Concepts
    - Overall average and quiz totals
    - Tailored remediation revision plan
    """
    analytics = await get_student_analytics(db=db, student_id=user.id)
    return analytics

@router.get("/document/{document_id}", response_model=StudentAnalyticsResponse)
async def get_document_analytics(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve adaptive learning analytics specifically for a single document:
    - Weak Concepts & Strong Concepts in this material
    - Document quizzes total and average score
    - Tailored revision plan for this book
    """
    analytics = await get_student_analytics(db=db, student_id=user.id, document_id=document_id)
    return analytics
