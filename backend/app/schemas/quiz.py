from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any

class QuizGenerateRequest(BaseModel):
    document_id: int
    chapter: Optional[str] = None
    target_page: Optional[int] = None
    difficulty: str = "medium"  # easy, medium, hard, exam
    num_questions: int = Field(default=5, ge=1, le=20)
    question_type: str = "mcq"  # mcq, true_false, mixed

class QuestionItem(BaseModel):
    id: int
    question_type: str
    question_text: str
    options: List[str]
    source_page: Optional[int] = None
    concept_name: Optional[str] = None

class QuizResponse(BaseModel):
    id: int
    title: str
    document_id: int
    difficulty: str
    total_questions: int
    questions: List[QuestionItem]
    
    model_config = ConfigDict(from_attributes=True)

class QuizAnswerSubmission(BaseModel):
    question_id: int
    selected_answer: str

class QuizSubmitRequest(BaseModel):
    time_taken_seconds: int = 0
    answers: List[QuizAnswerSubmission]

class QuestionResultDetail(BaseModel):
    question_id: int
    question_text: str
    selected_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    source_page: Optional[int] = None
    concept_name: Optional[str] = None

class QuizResultResponse(BaseModel):
    submission_id: int
    score: float
    total_questions: int
    percentage: float
    passed: bool
    time_taken_seconds: int
    questions_feedback: List[QuestionResultDetail]

class QuizHistoryItem(BaseModel):
    id: int
    quiz_id: int
    quiz_title: str
    document_id: int
    document_title: str
    subject: Optional[str] = None
    score: float
    total_questions: int
    percentage: float
    passed: bool
    time_taken_seconds: int
    submitted_at: Any

class DailyChallengeResponse(BaseModel):
    question_id: int
    question_text: str
    options: List[str]
    correct_answer: str
    explanation: str
    source_page: Optional[int] = None
    document_title: str
    subject: Optional[str] = None
