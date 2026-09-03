from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class DocumentBase(BaseModel):
    title: str
    subject: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentChunkResponse(BaseModel):
    id: int
    page_number: int
    chunk_index: int
    chapter: Optional[str] = None
    section_title: Optional[str] = None
    content: str
    
    model_config = ConfigDict(from_attributes=True)

class DocumentResponse(DocumentBase):
    id: int
    filename: str
    file_size: int
    total_pages: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class DocumentDetailResponse(DocumentResponse):
    chunks_count: int = 0
    concepts_count: int = 0
