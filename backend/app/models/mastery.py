from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Concept(Base):
    __tablename__ = "concepts"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)  # اسم المفهوم: مثلاً "قانون نيوتن الثاني"
    subject = Column(String(100), nullable=True)
    chapter = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    document = relationship("Document", back_populates="concepts")
    masteries = relationship("StudentMastery", back_populates="concept", cascade="all, delete-orphan")


class StudentMastery(Base):
    __tablename__ = "student_mastery"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    mastery_score = Column(Float, default=0.0)  # 0.0 to 100.0%
    total_attempts = Column(Integer, default=0)
    correct_attempts = Column(Integer, default=0)
    is_weak_point = Column(Boolean, default=False)
    primary_error_type = Column(String(50), nullable=True)  # knowledge_gap, misconception, calculation_mistake, careless_error
    error_summary = Column(Text, nullable=True)
    is_proficient = Column(Boolean, default=False)
    last_remediated_at = Column(DateTime, nullable=True)
    last_practiced_at = Column(DateTime, default=datetime.utcnow)
    
    student = relationship("User", back_populates="masteries")
    concept = relationship("Concept", back_populates="masteries")


class RemedialSession(Base):
    __tablename__ = "remedial_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    
    primary_error_type = Column(String(50), nullable=False, default="knowledge_gap")
    diagnosis = Column(Text, nullable=False)
    mini_lesson = Column(Text, nullable=False)
    questions_json = Column(Text, nullable=False)
    
    mastery_before = Column(Float, default=0.0)
    mastery_after = Column(Float, nullable=True)
    is_completed = Column(Boolean, default=False)
    is_proficient = Column(Boolean, default=False)
    score = Column(Float, default=0.0)
    total_questions = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    student = relationship("User", back_populates="remedial_sessions")
    concept = relationship("Concept")
    document = relationship("Document", back_populates="remedial_sessions")


