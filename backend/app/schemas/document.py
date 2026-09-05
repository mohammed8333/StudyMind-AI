from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class DocumentBase(BaseModel):
    title: str
    subject: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None

class DocumentDeleteResponse(BaseModel):
    message: str
    document_id: int

class DocumentChunkResponse(BaseModel):
    id: int
    page_number: int
    chunk_index: int
    chapter: Optional[str] = None
    section_title: Optional[str] = None
    source_type: Optional[str] = "pdf"
    content: str
    
    model_config = ConfigDict(from_attributes=True)

class DocumentResponse(DocumentBase):
    id: int
    filename: str
    file_type: Optional[str] = "pdf"
    file_size: int
    total_pages: int
    status: str
    progress_percentage: int = 0
    progress_stage: Optional[str] = "في قائمة الانتظار"
    retry_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class DocumentStatusResponse(BaseModel):
    id: int
    status: str
    progress_percentage: int = 0
    progress_stage: Optional[str] = "في قائمة الانتظار"
    total_pages: int = 0
    error_message: Optional[str] = None
    retry_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class DocumentDetailResponse(DocumentResponse):
    chunks_count: int = 0
    concepts_count: int = 0
