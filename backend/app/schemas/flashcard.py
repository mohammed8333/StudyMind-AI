from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime

CARD_TYPES = ["definition", "concept", "formula", "fact", "qa"]
CARD_TYPE_LABELS = {
    "definition": "تعريف ومصطلح",
    "concept": "مفهوم وعلاقة",
    "formula": "قانون ومعادلة",
    "fact": "حقيقة علمية",
    "qa": "سؤال وجواب",
}

class FlashcardCreate(BaseModel):
    document_id: int
    concept_id: Optional[int] = None
    concept_name: Optional[str] = None
    front: str = Field(..., min_length=2, description="وجه البطاقة (السؤال، المفهوم، المصطلح)")
    back: str = Field(..., min_length=2, description="ظهر البطاقة (الإجابة، الشرح، التعريف)")
    card_type: Literal["definition", "concept", "formula", "fact", "qa"] = "concept"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    source_page: Optional[int] = None
    source_section: Optional[str] = None


class FlashcardUpdate(BaseModel):
    front: Optional[str] = Field(None, min_length=2)
    back: Optional[str] = Field(None, min_length=2)
    card_type: Optional[Literal["definition", "concept", "formula", "fact", "qa"]] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    is_suspended: Optional[bool] = None
    is_favorite: Optional[bool] = None


class FlashcardGenerateRequest(BaseModel):
    document_id: int
    concept_id: Optional[int] = None
    count: int = Field(10, ge=3, le=50, description="عدد البطاقات المطلوب توليدها")
    card_types: Optional[List[str]] = Field(None, description="أنواع البطاقات المستهدفة")


class FlashcardReviewRequest(BaseModel):
    rating: Literal["again", "hard", "good", "easy"] = Field(
        ...,
        description="تقييم استرجاع البطاقة: again (إعادة), hard (صعب), good (جيد), easy (سهل)"
    )


class FlashcardResponse(BaseModel):
    id: int
    user_id: int
    document_id: int
    document_title: Optional[str] = None
    concept_id: Optional[int] = None
    concept_name: Optional[str] = None
    front: str
    back: str
    card_type: str
    card_type_label: str
    difficulty: str
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    is_suspended: bool
    is_favorite: bool
    repetition_count: int
    ease_factor: float
    interval_days: int
    next_review_at: datetime
    last_reviewed_at: Optional[datetime] = None
    review_state: str  # new, learning, review, mastered
    is_due: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FlashcardListResponse(BaseModel):
    items: List[FlashcardResponse]
    total: int
    page: int
    page_size: int


class FlashcardsDashboardMetrics(BaseModel):
    due_today: int
    new_cards: int
    learning: int
    mastered: int
    total_cards: int
    favorites_count: int
    suspended_count: int
    retention_rate: float


class FlashcardReviewResponse(BaseModel):
    card: FlashcardResponse
    rating: str
    next_review_at: datetime
    interval_days: int
    ease_factor: float
    review_state: str
    concept_mastery_updated: bool
    new_mastery_score: Optional[float] = None
    message: str
