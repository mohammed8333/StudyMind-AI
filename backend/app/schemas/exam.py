from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime

class ExamGenerateRequest(BaseModel):
    document_id: int
    title: Optional[str] = None
    subject: Optional[str] = None
    chapters: Optional[List[str]] = None
    num_questions: int = Field(default=10, ge=1, le=50)
    difficulty: str = Field(default="medium")  # easy, medium, hard, mock_exam
    duration_minutes: int = Field(default=30, ge=5, le=180)
    question_types: Optional[List[str]] = Field(default=["mcq", "true_false", "short_answer"])
    is_mock_mode: bool = False

    model_config = ConfigDict(from_attributes=True)


class ExamQuestionPublic(BaseModel):
    id: int
    question_type: str  # mcq, true_false, short_answer
    question_text: str
    options: Optional[List[str]] = None
    marks: float = 1.0
    source_page: Optional[int] = None
    order_index: int = 0

    model_config = ConfigDict(from_attributes=True)


class ExamResponse(BaseModel):
    id: int
    title: str
    document_id: int
    document_title: Optional[str] = None
    subject: Optional[str] = None
    chapters: List[str] = []
    difficulty: str
    duration_minutes: int
    total_questions: int
    total_marks: float
    passing_score_pct: float
    is_mock_mode: bool
    created_at: str
    questions: List[ExamQuestionPublic]

    model_config = ConfigDict(from_attributes=True)


class ExamAttemptStartResponse(BaseModel):
    attempt_id: int
    exam_id: int
    exam_title: str
    attempt_number: int
    started_at: str
    expires_at: str
    remaining_seconds: int
    is_mock_mode: bool
    total_questions: int
    total_marks: float
    duration_minutes: int
    questions: List[ExamQuestionPublic]

    model_config = ConfigDict(from_attributes=True)


class StudentQuestionAnswer(BaseModel):
    question_id: int
    student_answer: str = ""
    time_spent_seconds: int = 0


class ExamSubmitRequest(BaseModel):
    answers: List[StudentQuestionAnswer]
    total_time_taken_seconds: Optional[int] = None


class QuestionResultItem(BaseModel):
    question_id: int
    question_type: str
    question_text: str
    student_answer: str
    correct_answer: str
    is_correct: bool
    score_awarded: float
    max_marks: float
    time_spent_seconds: int
    explanation: str
    source_page: Optional[int] = None
    concept_name: Optional[str] = None
    error_type: Optional[str] = None
    error_reason: Optional[str] = None
    ai_feedback: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WeakConceptItem(BaseModel):
    concept_name: str
    questions_missed: int = 1
    source_page: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class RemedialRecommendationItem(BaseModel):
    title: str
    concept_name: str
    source_page: Optional[int] = None
    recommended_action: str
    priority: str = "high"  # high, medium, low

    model_config = ConfigDict(from_attributes=True)


class ExamResultResponse(BaseModel):
    attempt_id: int
    exam_id: int
    exam_title: str
    attempt_number: int
    status: str  # SUBMITTED, TIMED_OUT
    score: float
    total_marks: float
    percentage: float
    passed: bool
    time_taken_seconds: int
    correct_count: int
    wrong_count: int
    unanswered_count: int
    avg_time_per_question_seconds: float
    weak_concepts: List[WeakConceptItem] = []
    remedial_recommendations: List[RemedialRecommendationItem] = []
    summary_feedback: str
    questions_feedback: List[QuestionResultItem] = []

    model_config = ConfigDict(from_attributes=True)


class ExamHistoryItem(BaseModel):
    attempt_id: int
    exam_id: int
    exam_title: str
    document_id: int
    document_title: str
    subject: Optional[str] = None
    attempt_number: int
    score: float
    total_marks: float
    percentage: float
    passed: bool
    time_taken_seconds: int
    status: str
    is_mock_mode: bool
    submitted_at: str

    model_config = ConfigDict(from_attributes=True)
