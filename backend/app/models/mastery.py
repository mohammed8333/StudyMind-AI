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
    last_practiced_at = Column(DateTime, default=datetime.utcnow)
    
    student = relationship("User", back_populates="masteries")
    concept = relationship("Concept", back_populates="masteries")
