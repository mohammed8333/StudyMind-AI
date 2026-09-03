import os
import fitz  # PyMuPDF
import logging
from typing import List, Dict, Any, Tuple
from app.services.arabic_nlp import chunk_arabic_document

logger = logging.getLogger(__name__)

def is_arabic_text(text: str) -> bool:
    """Check if text contains Arabic characters."""
    for ch in text:
        if '\u0600' <= ch <= '\u06FF' or '\u0750' <= ch <= '\u077F':
            return True
    return False

def extract_text_from_pdf(file_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Extracts text page-by-page from a PDF file.
    Returns:
        pages: List of dicts with page_number, text, character_count
        metadata: Dict with total_pages, title, author, is_scanned_estimate
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")
        
    doc = fitz.open(file_path)
    total_pages = len(doc)
    pages: List[Dict[str, Any]] = []
    total_chars = 0
    empty_pages = 0
    
    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1  # 1-indexed for student familiarity
        text = page.get_text("text") or ""
        
        # Clean text
        clean_text = text.strip()
        char_len = len(clean_text)
        total_chars += char_len
        
        if char_len < 20:
            empty_pages += 1
            
        pages.append({
            "page_number": page_num,
            "text": clean_text,
            "char_count": char_len
        })
        
    doc.close()
    
    is_scanned = (empty_pages / total_pages > 0.6) if total_pages > 0 else False
    
    metadata = {
        "total_pages": total_pages,
        "total_characters": total_chars,
        "empty_pages": empty_pages,
        "is_scanned": is_scanned,
    }
    
    return pages, metadata

def process_and_chunk_pdf(
    file_path: str,
    chunk_size: int = 400,
    chunk_overlap: int = 60
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """High-level pipeline: extracts pages from PDF and chunks them with Arabic semantic rules."""
    pages, metadata = extract_text_from_pdf(file_path)
    chunks = chunk_arabic_document(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return chunks, metadata
