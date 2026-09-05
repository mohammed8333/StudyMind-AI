from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True, index=True)
    concept_name = Column(String(255), nullable=True)
    
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    card_type = Column(String(50), default="concept", nullable=False)  # definition, concept, formula, fact, qa
    difficulty = Column(String(50), default="medium", nullable=False)  # easy, medium, hard
    
    source_page = Column(Integer, nullable=True)
    source_section = Column(String(255), nullable=True)
    
    is_suspended = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    
    # Spaced Repetition (SM-2 Algorithm parameters)
    repetition_count = Column(Integer, default=0, nullable=False)
    ease_factor = Column(Float, default=2.5, nullable=False)
    interval_days = Column(Integer, default=0, nullable=False)
    next_review_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    review_state = Column(String(50), default="new", nullable=False)  # new, learning, review, mastered
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    user = relationship("User", back_populates="flashcards")
    document = relationship("Document", back_populates="flashcards")
    concept = relationship("Concept")
    reviews = relationship("FlashcardReviewLog", back_populates="card", cascade="all, delete-orphan")


class FlashcardReviewLog(Base):
    __tablename__ = "flashcard_review_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(String(20), nullable=False)  # again, hard, good, easy
    repetition_number = Column(Integer, default=1, nullable=False)
    interval_days_applied = Column(Integer, default=1, nullable=False)
    ease_factor_applied = Column(Float, default=2.5, nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    card = relationship("Flashcard", back_populates="reviews")
    user = relationship("User")
