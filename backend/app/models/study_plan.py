from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class StudyPlan(Base):
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="خطة المذاكرة الذكية")
    exam_date = Column(Date, nullable=False)
    subjects_json = Column(Text, nullable=False, default="[]")
    available_study_time = Column(Integer, default=600)  # minutes per week
    preferred_days_json = Column(Text, nullable=False, default="[]")
    daily_time_limit = Column(Integer, default=120)  # minutes per day
    priority = Column(String(50), default="weak_points_first")  # weak_points_first, balanced, exam_readiness
    is_active = Column(Boolean, default=True)
    total_tasks = Column(Integer, default=0)
    completed_tasks = Column(Integer, default=0)
    progress_percentage = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User", back_populates="study_plans")
    tasks = relationship(
        "StudyPlanTask",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="StudyPlanTask.scheduled_date, StudyPlanTask.order_index"
    )


class StudyPlanTask(Base):
    __tablename__ = "study_plan_tasks"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    day_number = Column(Integer, default=1)
    subject = Column(String(100), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    chapter = Column(String(255), nullable=True)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True)
    concept_name = Column(String(255), nullable=True)
    activity_type = Column(String(50), nullable=False)  # Study, Review, Remedial, Quiz, Mock Exam
    duration_minutes = Column(Integer, default=30)
    recommended_questions_count = Column(Integer, default=5)
    status = Column(String(50), default="PENDING")  # PENDING, COMPLETED, OVERDUE, SKIPPED
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)

    plan = relationship("StudyPlan", back_populates="tasks")
    concept = relationship("Concept")
    document = relationship("Document")
