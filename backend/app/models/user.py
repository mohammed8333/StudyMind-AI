from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    grade_or_level = Column(String(100), nullable=True)  # e.g., "ثانوية عامة", "الصف الأول الثانوي"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")
    submissions = relationship("StudentSubmission", back_populates="student", cascade="all, delete-orphan")
    masteries = relationship("StudentMastery", back_populates="student", cascade="all, delete-orphan")
