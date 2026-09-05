from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.schemas.study_plan import (
    StudyPlanGenerateRequest,
    StudyPlanUpdateRequest,
    StudyPlanResponse,
    StudyPlanTaskResponse,
    StudyPlanTaskUpdate,
    TodayPlanResponse,
    CalendarDayTasks
)
from app.services.study_planner import (
    generate_intelligent_study_plan,
    get_active_study_plan,
    get_today_tasks,
    get_calendar_tasks,
    update_task_status,
    reschedule_overdue_tasks,
    sync_plan_with_student_performance
)

router = APIRouter()

@router.post("/generate", response_model=StudyPlanResponse)
async def create_plan(
    req: StudyPlanGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates a personalized, intelligent study plan persisted in the database.
    Distributes tasks (Study, Review, Remedial, Quiz, Mock Exam) based on:
    - Exam date and days available
    - Weak points and mastery levels
    - Remaining material and chapters
    - Daily time limit
    """
    try:
        plan = await generate_intelligent_study_plan(db=db, student_id=user.id, req=req)
        return plan
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"فشل في إنشاء الخطة الدراسية الذكية: {str(e)}"
        )

@router.get("/active", response_model=Optional[StudyPlanResponse])
async def get_active_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the currently active persistent study plan with:
    - Exam countdown (days remaining)
    - Cumulative progress percentage
    - List of scheduled tasks
    """
    plan = await get_active_study_plan(db=db, student_id=user.id)
    return plan

@router.get("/today", response_model=TodayPlanResponse)
async def get_today_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the study tasks scheduled for today with direct action buttons.
    """
    today_plan = await get_today_tasks(db=db, student_id=user.id)
    return today_plan

@router.get("/calendar", response_model=List[CalendarDayTasks])
async def get_calendar(
    start_date: Optional[date] = Query(None, description="تاريخ البداية"),
    end_date: Optional[date] = Query(None, description="تاريخ النهاية"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves study plan tasks grouped by date for the calendar view.
    """
    calendar_days = await get_calendar_tasks(
        db=db,
        student_id=user.id,
        start_date=start_date,
        end_date=end_date
    )
    return calendar_days

@router.patch("/tasks/{task_id}", response_model=StudyPlanTaskResponse)
async def update_task(
    task_id: int,
    req: StudyPlanTaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates a task (Mark Complete, change status, reschedule, or add notes).
    Recalculates plan progress percentage immediately.
    """
    try:
        updated_task = await update_task_status(
            db=db,
            student_id=user.id,
            task_id=task_id,
            update_data=req
        )
        return updated_task
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/reschedule-overdue", response_model=Dict[str, Any])
async def reschedule_overdue(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Reschedules all overdue pending tasks into upcoming available study days.
    """
    result = await reschedule_overdue_tasks(db=db, student_id=user.id)
    return result

@router.post("/sync", response_model=Dict[str, Any])
async def sync_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Triggers performance-based adaptive synchronization:
    - Reduces review time for concepts mastered by the student (>=75%).
    - Injects remedial sessions into upcoming days for dropped concepts (<70%).
    """
    result = await sync_plan_with_student_performance(db=db, student_id=user.id)
    return result
