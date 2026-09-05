import os
import logging
from typing import List, Dict, Any, Tuple
from app.services.extractors.base import BaseDocumentExtractor

logger = logging.getLogger(__name__)

class TextExtractor(BaseDocumentExtractor):
    """
    Extracts plain text from .txt files with multi-encoding support (UTF-8, CP1256, UTF-16).
    Splits long text documents into logical virtual pages for cohesive indexing and citations.
    """

    SUPPORTED_ENCODINGS = ["utf-8", "utf-8-sig", "cp1256", "utf-16", "latin-1"]

    def extract(self, file_path: str, **kwargs) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"TXT file not found: {file_path}")

        raw_bytes = b""
        with open(file_path, "rb") as f:
            raw_bytes = f.read()

        text = ""
        used_encoding = "utf-8"
        for enc in self.SUPPORTED_ENCODINGS:
            try:
                text = raw_bytes.decode(enc)
                used_encoding = enc
                break
            except Exception:
                continue

        # Standardize line breaks
        text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
        
        # Check for explicit form feed page breaks (\x0c)
        if "\x0c" in text:
            raw_pages = [p.strip() for p in text.split("\x0c") if p.strip()]
        else:
            # Partition by word count into sections (~400 words per virtual page)
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            raw_pages = []
            current_page_paras = []
            current_words = 0

            for para in paragraphs:
                words = len(para.split())
                if current_words + words > 450 and current_page_paras:
                    raw_pages.append("\n\n".join(current_page_paras))
                    current_page_paras = [para]
                    current_words = words
                else:
                    current_page_paras.append(para)
                    current_words += words

            if current_page_paras:
                raw_pages.append("\n\n".join(current_page_paras))

        if not raw_pages:
            raw_pages = [text] if text else [""]

        pages: List[Dict[str, Any]] = []
        for idx, page_content in enumerate(raw_pages):
            pages.append({
                "page_number": idx + 1,
                "text": page_content,
                "char_count": len(page_content),
                "source_type": "txt",
                "is_ocr": False
            })

        metadata = {
            "total_pages": len(pages),
            "total_characters": sum(p["char_count"] for p in pages),
            "encoding": used_encoding,
            "source_type": "txt",
            "is_scanned": False,
            "ocr_applied": False,
        }

        return pages, metadata
