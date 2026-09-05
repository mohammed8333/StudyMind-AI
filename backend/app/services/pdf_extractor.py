import os
import logging
import fitz  # PyMuPDF
from typing import List, Dict, Any, Tuple, Optional, Callable
from app.core.config import settings
from app.services.arabic_nlp import chunk_arabic_document, normalize_ocr_arabic_text
from app.services.ocr_engine import BaseOCREngine, get_ocr_engine

logger = logging.getLogger(__name__)

def is_arabic_text(text: str) -> bool:
    """Check if text contains Arabic characters."""
    for ch in text:
        if '\u0600' <= ch <= '\u06FF' or '\u0750' <= ch <= '\u077F':
            return True
    return False

def extract_text_from_pdf(
    file_path: str,
    ocr_engine: Optional[BaseOCREngine] = None,
    min_text_chars: Optional[int] = None,
    ocr_lang: Optional[str] = None,
    on_ocr_start: Optional[Callable[[], Any]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Extracts text page-by-page from a PDF file with selective Arabic/English OCR fallback.
    
    Pages containing an existing digital text layer are read directly for maximum speed.
    Pages lacking sufficient text layer (scanned pages or text images) are rendered as high-DPI
    images and processed via the OCR pipeline with post-OCR Arabic normalization.
    
    Returns:
        pages: List of dicts with page_number, text, char_count, is_ocr
        metadata: Dict with processing stats, OCR applied flag, and any errors encountered
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    threshold = min_text_chars if min_text_chars is not None else settings.OCR_MIN_TEXT_CHARS
    engine = ocr_engine if ocr_engine is not None else get_ocr_engine()
    
    doc = fitz.open(file_path)
    total_pages = len(doc)
    pages: List[Dict[str, Any]] = []
    total_chars = 0
    empty_pages = 0
    ocr_pages_count = 0
    ocr_errors: List[str] = []
    ocr_notified = False

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1  # 1-indexed for student familiarity
        
        # 1. Attempt digital text extraction
        raw_text = page.get_text("text") or ""
        clean_text = raw_text.strip()
        char_len = len(clean_text)
        is_ocr_applied = False

        # 2. Selective OCR: Trigger only if text layer is empty or below threshold
        if char_len < threshold:
            if engine and engine.is_available():
                try:
                    if on_ocr_start and not ocr_notified:
                        try:
                            on_ocr_start()
                        except Exception as e:
                            logger.warning(f"Error executing on_ocr_start callback: {e}")
                        ocr_notified = True

                    logger.info(
                        f"Page {page_num}/{total_pages} in '{os.path.basename(file_path)}' has {char_len} chars (< {threshold}). "
                        f"Executing OCR ({engine.get_name()})..."
                    )
                    
                    # Render page to high-DPI pixmap
                    pix = page.get_pixmap(dpi=settings.OCR_DPI)
                    img_bytes = pix.tobytes("png")
                    
                    # Extract text via OCR engine
                    ocr_result = engine.extract_text(img_bytes, lang=ocr_lang)
                    
                    if ocr_result and ocr_result.strip():
                        # Normalize Arabic OCR text while preserving grammatical tashkeel
                        normalized_ocr = normalize_ocr_arabic_text(ocr_result, preserve_tashkeel=True)
                        if normalized_ocr.strip():
                            clean_text = normalized_ocr
                            char_len = len(clean_text)
                            is_ocr_applied = True
                            ocr_pages_count += 1
                            logger.info(f"Page {page_num} OCR extracted {char_len} characters.")
                except Exception as e:
                    err_msg = f"Page {page_num} OCR failure: {str(e)}"
                    logger.error(err_msg, exc_info=True)
                    ocr_errors.append(err_msg)
            else:
                logger.warning(f"Page {page_num} requires OCR, but OCR engine is unavailable.")
                ocr_errors.append(f"Page {page_num}: OCR engine unavailable")

        total_chars += char_len
        if char_len < 20:
            empty_pages += 1

        pages.append({
            "page_number": page_num,
            "text": clean_text,
            "char_count": char_len,
            "is_ocr": is_ocr_applied
        })

    doc.close()

    is_scanned = (empty_pages / total_pages > 0.6) if total_pages > 0 else False

    metadata = {
        "total_pages": total_pages,
        "total_characters": total_chars,
        "empty_pages": empty_pages,
        "is_scanned": is_scanned,
        "ocr_pages_count": ocr_pages_count,
        "ocr_applied": ocr_pages_count > 0,
        "ocr_engine": engine.get_name() if engine else "None",
        "ocr_errors": ocr_errors,
    }

    return pages, metadata

def process_and_chunk_pdf(
    file_path: str,
    chunk_size: int = 400,
    chunk_overlap: int = 60,
    ocr_engine: Optional[BaseOCREngine] = None,
    min_text_chars: Optional[int] = None,
    ocr_lang: Optional[str] = None,
    on_ocr_start: Optional[Callable[[], Any]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    High-level pipeline: extracts pages from PDF (with selective Arabic/English OCR when needed)
    and chunks them with Arabic semantic structure preservation and page tracking.
    """
    pages, metadata = extract_text_from_pdf(
        file_path,
        ocr_engine=ocr_engine,
        min_text_chars=min_text_chars,
        ocr_lang=ocr_lang,
        on_ocr_start=on_ocr_start
    )
    chunks = chunk_arabic_document(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return chunks, metadata
