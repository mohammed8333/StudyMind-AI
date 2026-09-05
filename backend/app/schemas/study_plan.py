from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import date, datetime

ACTIVITY_LABELS = {
    "Study": "مذاكرة محتوى جديد",
    "Review": "مراجعة وتثبيت",
    "Remedial": "جلسة علاجية لنقطة ضعف",
    "Quiz": "اختبار تقييمي قصير",
    "Mock Exam": "امتحان تجريبي شامل"
}

class StudyPlanGenerateRequest(BaseModel):
    exam_date: date
    subjects: List[str] = Field(default_factory=list)
    available_study_time: int = Field(default=600, ge=60, le=4000)  # minutes per week
    preferred_days: List[str] = Field(
        default_factory=lambda: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]
    )
    daily_time_limit: int = Field(default=120, ge=30, le=720)  # minutes per day
    priority: str = Field(default="weak_points_first")  # weak_points_first, balanced, exam_readiness
    title: Optional[str] = None

class StudyPlanUpdateRequest(BaseModel):
    title: Optional[str] = None
    exam_date: Optional[date] = None
    subjects: Optional[List[str]] = None
    available_study_time: Optional[int] = None
    preferred_days: Optional[List[str]] = None
    daily_time_limit: Optional[int] = None
    priority: Optional[str] = None

class StudyPlanTaskResponse(BaseModel):
    id: int
    plan_id: int
    scheduled_date: date
    day_number: int
    subject: str
    document_id: Optional[int] = None
    document_title: Optional[str] = None
    chapter: Optional[str] = None
    concept_id: Optional[int] = None
    concept_name: Optional[str] = None
    activity_type: str
    activity_label: str
    duration_minutes: int
    recommended_questions_count: int
    status: str
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    order_index: int

    model_config = ConfigDict(from_attributes=True)

class StudyPlanTaskUpdate(BaseModel):
    status: Optional[str] = None  # COMPLETED, PENDING, SKIPPED
    scheduled_date: Optional[date] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None

class StudyPlanResponse(BaseModel):
    id: int
    student_id: int
    title: str
    exam_date: date
    days_until_exam: int
    subjects: List[str]
    available_study_time: int
    preferred_days: List[str]
    daily_time_limit: int
    priority: str
    is_active: bool
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    created_at: datetime
    updated_at: datetime
    tasks: Optional[List[StudyPlanTaskResponse]] = None

    model_config = ConfigDict(from_attributes=True)

class TodayPlanResponse(BaseModel):
    date: date
    day_name: str
    total_tasks_today: int
    completed_tasks_today: int
    today_progress_percentage: float
    estimated_total_minutes: int
    tasks: List[StudyPlanTaskResponse]

class CalendarDayTasks(BaseModel):
    date: date
    day_name: str
    tasks_count: int
    completed_count: int
    is_overdue: bool
    tasks: List[StudyPlanTaskResponse]
