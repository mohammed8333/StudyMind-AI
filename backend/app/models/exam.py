from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Exam(Base):
    __tablename__ = "exams"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    subject = Column(String(100), nullable=True)
    chapters_json = Column(Text, nullable=True)  # JSON array: ["الفصل الأول", "الفصل الثاني"]
    difficulty = Column(String(50), default="medium")  # easy, medium, hard, mock_exam
    duration_minutes = Column(Integer, default=30)  # 15, 30, 45, 60, 90, 120
    total_questions = Column(Integer, default=10)
    total_marks = Column(Float, default=10.0)
    passing_score_pct = Column(Float, default=60.0)
    is_mock_mode = Column(Boolean, default=False)  # True = official exam simulation mode
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="exams")
    document = relationship("Document", back_populates="exams")
    questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan", order_by="ExamQuestion.order_index")
    attempts = relationship("ExamAttempt", back_populates="exam", cascade="all, delete-orphan", order_by="ExamAttempt.attempt_number.desc()")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"
    
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True)
    question_type = Column(String(50), default="mcq")  # mcq, true_false, short_answer
    question_text = Column(Text, nullable=False)
    options_json = Column(Text, nullable=True)  # JSON array of options for mcq & true_false
    correct_answer = Column(Text, nullable=False)  # Choice text or "صح"/"خطأ" or model answer for short_answer
    rubric_keywords_json = Column(Text, nullable=True)  # JSON array of keywords for grading short_answer
    explanation = Column(Text, nullable=False)
    marks = Column(Float, default=1.0)
    source_page = Column(Integer, nullable=True)
    order_index = Column(Integer, default=0)
    
    exam = relationship("Exam", back_populates="questions")
    concept = relationship("Concept")
    responses = relationship("ExamQuestionResponse", back_populates="question", cascade="all, delete-orphan")


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, default=1)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)  # Server enforced deadline = started_at + duration + grace
    submitted_at = Column(DateTime, nullable=True)
    status = Column(String(50), default="IN_PROGRESS")  # IN_PROGRESS, SUBMITTED, TIMED_OUT
    
    score = Column(Float, default=0.0)
    total_marks = Column(Float, default=0.0)
    percentage = Column(Float, default=0.0)
    passed = Column(Boolean, default=False)
    time_taken_seconds = Column(Integer, default=0)
    
    correct_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)
    unanswered_count = Column(Integer, default=0)
    avg_time_per_question_seconds = Column(Float, default=0.0)
    
    weak_concepts_json = Column(Text, nullable=True)  # JSON array of weak concepts identified
    remedial_recommendations_json = Column(Text, nullable=True)  # JSON array of actionable recommendations
    summary_feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    exam = relationship("Exam", back_populates="attempts")
    student = relationship("User", back_populates="exam_attempts")
    responses = relationship("ExamQuestionResponse", back_populates="attempt", cascade="all, delete-orphan")


class ExamQuestionResponse(Base):
    __tablename__ = "exam_question_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("exam_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_answer = Column(Text, nullable=True)  # Student's answer string, empty if unanswered
    is_correct = Column(Boolean, default=False)
    score_awarded = Column(Float, default=0.0)
    max_marks = Column(Float, default=1.0)
    time_spent_seconds = Column(Integer, default=0)
    error_type = Column(String(50), nullable=True)  # knowledge_gap, misconception, calculation_mistake, careless_error, unanswered
    error_reason = Column(Text, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    
    attempt = relationship("ExamAttempt", back_populates="responses")
    question = relationship("ExamQuestion", back_populates="responses")
