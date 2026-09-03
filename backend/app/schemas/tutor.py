from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class ExplanationLevel(str, Enum):
    VERY_SIMPLE = "very_simple"    # بسيط جداً - فكرة فاينمان وتشبيهات يومية
    MEDIUM = "medium"              # متوسط - شرح واضح ومتزن
    TEXTBOOK = "textbook"          # مستوى الكتاب والمدرسة - التزام بنص المنهج
    ADVANCED = "advanced"          # متقدم وعميق - براهين وتطبيقات وتفوق

class SourceCitation(BaseModel):
    page_number: int
    chapter: Optional[str] = None
    section_title: Optional[str] = None
    excerpt: str

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class TutorAskRequest(BaseModel):
    document_id: int
    question: str
    target_page: Optional[int] = None
    explanation_level: ExplanationLevel = ExplanationLevel.MEDIUM
    history: Optional[List[ChatMessage]] = []

class TutorResponse(BaseModel):
    answer: str
    explanation_level: ExplanationLevel
    sources: List[SourceCitation] = []
    suggested_followups: List[str] = []

class ChatMessageRecord(BaseModel):
    id: int
    role: str
    content: str
    explanation_level: Optional[str] = None
    sources: List[SourceCitation] = []
    suggested_followups: List[str] = []
    created_at: Any

class ChatHistoryResponse(BaseModel):
    document_id: int
    total_messages: int
    messages: List[ChatMessageRecord]
