from typing import Dict, Type
from app.services.extractors.base import BaseDocumentExtractor
from app.services.extractors.pdf_extractor import PDFExtractor
from app.services.extractors.docx_extractor import DocxExtractor
from app.services.extractors.text_extractor import TextExtractor
from app.services.extractors.image_extractor import ImageExtractor

EXTRACTOR_REGISTRY: Dict[str, Type[BaseDocumentExtractor]] = {
    "pdf": PDFExtractor,
    "docx": DocxExtractor,
    "txt": TextExtractor,
    "image": ImageExtractor,
}

def get_extractor(file_type: str) -> BaseDocumentExtractor:
    """Factory function returning the appropriate extractor instance for a given file type."""
    normalized_type = file_type.lower()
    extractor_cls = EXTRACTOR_REGISTRY.get(normalized_type)
    if not extractor_cls:
        raise ValueError(f"No extractor registered for file type '{file_type}'. Supported types: {list(EXTRACTOR_REGISTRY.keys())}")
    return extractor_cls()
