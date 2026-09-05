from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    subject = Column(String(100), nullable=True)  # فيزياء، لغة عربية، كيمياء، أحياء، تاريخ...
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), default="pdf", nullable=True)  # pdf, docx, txt, image
    file_size = Column(Integer, default=0)
    total_pages = Column(Integer, default=0)
    status = Column(String(50), default="PENDING")  # PENDING, UPLOADING, PROCESSING, OCR, INDEXING, READY, FAILED
    progress_percentage = Column(Integer, default=0, nullable=False)
    progress_stage = Column(String(100), default="في قائمة الانتظار", nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner = relationship("User", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    concepts = relationship("Concept", back_populates="document", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="document", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="document", cascade="all, delete-orphan")
    exams = relationship("Exam", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    chapter = Column(String(255), nullable=True)
    section_title = Column(String(255), nullable=True)
    source_type = Column(String(50), default="pdf", nullable=True)  # pdf, docx, txt, image
    content = Column(Text, nullable=False)
    content_normalized = Column(Text, nullable=False)  # Arabic normalized for keyword / lexical search
    embedding_json = Column(Text, nullable=True)       # Embedding vector stored as JSON string (universal compatibility)
    
    document = relationship("Document", back_populates="chunks")
