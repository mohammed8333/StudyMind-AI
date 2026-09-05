import os
import logging
from typing import List, Dict, Any, Tuple, Optional
from app.services.extractors.base import BaseDocumentExtractor
from app.services.ocr_engine import BaseOCREngine, get_ocr_engine
from app.services.arabic_nlp import normalize_ocr_arabic_text

logger = logging.getLogger(__name__)

class ImageExtractor(BaseDocumentExtractor):
    """
    Extracts text from image files (JPG, JPEG, PNG) by passing them directly
    through the Arabic/English OCR engine and applying post-OCR normalization.
    """

    def __init__(self, ocr_engine: Optional[BaseOCREngine] = None):
        self.ocr_engine = ocr_engine

    def extract(self, file_path: str, **kwargs) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Image file not found: {file_path}")

        engine = self.ocr_engine or kwargs.get("ocr_engine") or get_ocr_engine()
        ocr_errors: List[str] = []
        extracted_text = ""

        if engine and engine.is_available():
            try:
                lang = kwargs.get("ocr_lang", "ara+eng")
                raw_text = engine.extract_text(file_path, lang=lang)
                if raw_text and raw_text.strip():
                    extracted_text = normalize_ocr_arabic_text(raw_text, preserve_tashkeel=True)
            except Exception as e:
                err_msg = f"Image OCR extraction error: {e}"
                logger.error(err_msg, exc_info=True)
                ocr_errors.append(err_msg)
        else:
            logger.warning("ImageExtractor requested but OCR engine is unavailable.")
            ocr_errors.append("OCR engine unavailable for image processing")

        pages = [{
            "page_number": 1,
            "text": extracted_text,
            "char_count": len(extracted_text),
            "source_type": "image",
            "is_ocr": True
        }]

        metadata = {
            "total_pages": 1,
            "total_characters": len(extracted_text),
            "source_type": "image",
            "is_scanned": True,
            "ocr_applied": True,
            "ocr_engine": engine.get_name() if engine else "None",
            "ocr_errors": ocr_errors,
        }

        return pages, metadata
