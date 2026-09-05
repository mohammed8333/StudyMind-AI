from pydantic import BaseModel, ConfigDict
from typing import List, Optional

class ConceptMasteryItem(BaseModel):
    concept_id: int
    concept_name: str
    subject: Optional[str] = None
    mastery_score: float
    total_attempts: int
    correct_attempts: int
    is_weak_point: bool
    primary_error_type: Optional[str] = None
    primary_error_label: Optional[str] = None
    error_summary: Optional[str] = None
    is_proficient: bool = False
    
    model_config = ConfigDict(from_attributes=True)

class StudentAnalyticsResponse(BaseModel):
    total_documents: int
    total_quizzes_taken: int
    average_score: float
    total_questions_answered: int = 0
    streak_days: int = 0
    weak_concepts: List[ConceptMasteryItem]
    strong_concepts: List[ConceptMasteryItem]
    recommended_revision_plan: List[str]
