from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date, datetime

class ConceptWeaknessItem(BaseModel):
    concept_id: int
    concept_name: str
    subject: Optional[str] = None
    chapter: Optional[str] = None
    document_id: Optional[int] = None
    mastery_score: float = 0.0
    total_attempts: int = 0
    correct_attempts: int = 0
    primary_error_type: Optional[str] = None
    primary_error_label: Optional[str] = None
    error_summary: Optional[str] = None

class StudentLearningStateResponse(BaseModel):
    overall_mastery: float = 0.0
    total_documents: int = 0
    total_quizzes_taken: int = 0
    total_exams_taken: int = 0
    weak_concepts: List[ConceptWeaknessItem] = []
    strong_concepts: List[str] = []
    nearest_exam_date: Optional[date] = None
    days_until_exam: Optional[int] = None
    exam_target_subjects: List[str] = []
    exam_readiness_score: float = 0.0
    active_plan_id: Optional[int] = None
    active_plan_progress: float = 0.0
    today_tasks_count: int = 0
    today_estimated_minutes: int = 0
    overdue_tasks_count: int = 0
    is_neglected: bool = False
    due_flashcards_count: int = 0
    current_focus_subject: Optional[str] = None

class CopilotActionItem(BaseModel):
    action_type: str = Field(..., description="REMEDIATE, STUDY, QUIZ, REVIEW_FLASHCARDS, REBALANCE, MOCK_EXAM")
    title: str
    description: str
    rationale: str
    urgency: str = Field("NORMAL", description="CRITICAL, HIGH, NORMAL")
    badge_label: str
    action_url: str
    payload: Dict[str, Any] = {}

class WhatToStudyNowResponse(BaseModel):
    recommendation: CopilotActionItem
    alternative_actions: List[CopilotActionItem] = []
    student_headline: str
    state_summary: Dict[str, Any] = {}

class DailyBriefingResponse(BaseModel):
    greeting: str
    date_str: str
    day_name_arabic: str
    exam_countdown_text: Optional[str] = None
    days_until_exam: Optional[int] = None
    neglect_alert: Optional[str] = None
    focus_headline: str
    today_tasks_summary: str
    primary_action: CopilotActionItem
    quick_tips: List[str] = []

class CopilotChatRequest(BaseModel):
    message: str
    document_id: Optional[int] = None
    history_limit: int = 10

class CopilotChatResponse(BaseModel):
    reply: str
    suggested_action: Optional[CopilotActionItem] = None
    citations: List[Dict[str, Any]] = []
    quick_prompts: List[str] = []

class CopilotMessageItem(BaseModel):
    id: int
    role: str
    content: str
    action_type: Optional[str] = None
    action_payload: Optional[Dict[str, Any]] = None
    citations: Optional[List[Dict[str, Any]]] = None
    created_at: datetime

class CopilotRebalanceResponse(BaseModel):
    success: bool
    message: str
    rescheduled_count: int
    new_target_date: Optional[date] = None
