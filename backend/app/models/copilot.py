from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class CopilotMessage(Base):
    __tablename__ = "copilot_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user", "copilot", "system"
    content = Column(Text, nullable=False)
    
    # Action card metadata (if this message proposes an actionable execution)
    action_type = Column(String(50), nullable=True)  # REMEDIATE, STUDY, QUIZ, REVIEW_FLASHCARDS, REBALANCE, MOCK_EXAM
    action_payload_json = Column(Text, nullable=True)  # JSON payload with ids, urls, etc.
    
    # RAG citations (if document search was performed)
    citations_json = Column(Text, nullable=True)  # JSON list of source references with pages
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="copilot_messages")
