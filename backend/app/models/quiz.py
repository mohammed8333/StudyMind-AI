from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Quiz(Base):
    __tablename__ = "quizzes"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chapter = Column(String(255), nullable=True)
    difficulty = Column(String(50), default="medium")  # easy, medium, hard, exam
    total_questions = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    document = relationship("Document", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")
    submissions = relationship("StudentSubmission", back_populates="quiz", cascade="all, delete-orphan")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True)
    question_type = Column(String(50), default="mcq")  # mcq, true_false, fill_blank
    question_text = Column(Text, nullable=False)
    options_json = Column(Text, nullable=True)  # JSON string array: ["خيار 1", "خيار 2", ...]
    correct_answer = Column(String(255), nullable=False)
    explanation = Column(Text, nullable=False)
    source_page = Column(Integer, nullable=True)
    
    quiz = relationship("Quiz", back_populates="questions")
    concept = relationship("Concept")
    responses = relationship("QuestionResponse", back_populates="question", cascade="all, delete-orphan")


class StudentSubmission(Base):
    __tablename__ = "student_submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, default=0.0)
    total_questions = Column(Integer, default=0)
    percentage = Column(Float, default=0.0)
    time_taken_seconds = Column(Integer, default=0)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    
    quiz = relationship("Quiz", back_populates="submissions")
    student = relationship("User", back_populates="submissions")
    responses = relationship("QuestionResponse", back_populates="submission", cascade="all, delete-orphan")


class QuestionResponse(Base):
    __tablename__ = "question_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("student_submissions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    student_answer = Column(String(255), nullable=False)
    is_correct = Column(Boolean, default=False)
    
    submission = relationship("StudentSubmission", back_populates="responses")
    question = relationship("QuizQuestion", back_populates="responses")
