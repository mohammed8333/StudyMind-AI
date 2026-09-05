from pydantic import BaseModel, ConfigDict
from typing import List, Optional

class RemedialQuestionItem(BaseModel):
    id: int
    question_text: str
    question_type: str = "mcq"
    options: List[str]
    source_page: Optional[int] = None

class RemedialSessionResponse(BaseModel):
    session_id: int
    concept_id: int
    concept_name: str
    document_id: int
    document_title: str
    primary_error_type: str
    primary_error_label: str
    diagnosis: str
    mini_lesson: str
    mastery_before: float
    total_questions: int
    questions: List[RemedialQuestionItem]
    
    model_config = ConfigDict(from_attributes=True)

class RemedialAnswerItem(BaseModel):
    question_id: int
    selected_answer: str

class RemedialSubmitRequest(BaseModel):
    answers: List[RemedialAnswerItem]

class RemedialQuestionFeedback(BaseModel):
    question_id: int
    question_text: str
    selected_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    source_page: Optional[int] = None

class RemedialResultResponse(BaseModel):
    session_id: int
    concept_id: int
    concept_name: str
    score: float
    total_questions: int
    percentage: float
    mastery_before: float
    mastery_after: float
    is_proficient: bool
    proficiency_message: str
    questions_feedback: List[RemedialQuestionFeedback]

class WeakConceptItem(BaseModel):
    concept_id: int
    concept_name: str
    document_id: int
    document_title: str
    mastery_score: float
    primary_error_type: Optional[str] = None
    primary_error_label: Optional[str] = None
    error_summary: Optional[str] = None
    total_attempts: int
    correct_attempts: int
    is_proficient: bool = False
    
    model_config = ConfigDict(from_attributes=True)
