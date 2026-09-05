from typing import List, Dict, Any, Tuple
from app.services.extractors.base import BaseDocumentExtractor
from app.services.pdf_extractor import extract_text_from_pdf

class PDFExtractor(BaseDocumentExtractor):
    """
    Adapter for the existing high-performance PyMuPDF extractor with selective OCR.
    Preserves 100% backwards compatibility and existing behavior.
    """

    def extract(self, file_path: str, **kwargs) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        pages, metadata = extract_text_from_pdf(
            file_path,
            ocr_engine=kwargs.get("ocr_engine"),
            min_text_chars=kwargs.get("min_text_chars"),
            ocr_lang=kwargs.get("ocr_lang"),
            on_ocr_start=kwargs.get("on_ocr_start")
        )
        for page in pages:
            page["source_type"] = "pdf"
        metadata["source_type"] = "pdf"
        return pages, metadata
