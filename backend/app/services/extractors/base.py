from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple

class BaseDocumentExtractor(ABC):
    """Abstract Base Class for format-specific document extractors."""

    @abstractmethod
    def extract(self, file_path: str, **kwargs) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Extracts pages/sections from a file into a standardized list of page dictionaries.
        
        Returns:
            pages: List[Dict[str, Any]] where each item contains:
                - page_number: int (1-indexed page or section number)
                - text: str (raw or normalized text content)
                - char_count: int
                - source_type: str ('pdf', 'docx', 'txt', 'image')
                - (optional) is_ocr: bool
            metadata: Dict[str, Any] containing processing statistics
        """
        pass
