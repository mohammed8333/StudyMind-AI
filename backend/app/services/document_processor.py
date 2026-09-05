import logging
from typing import List, Dict, Any, Tuple, Optional
from app.services.extractors.factory import get_extractor
from app.services.arabic_nlp import chunk_arabic_document, normalize_ocr_arabic_text

logger = logging.getLogger(__name__)

class DocumentProcessor:
    """
    Unified Document Processing Pipeline:
    Document -> Extractor -> Normalizer -> Chunker -> Indexer
    
    Standardizes ingestion across all supported file formats:
    PDF, DOCX, TXT, JPG, JPEG, and PNG.
    """

    def process(
        self,
        file_path: str,
        file_type: str,
        chunk_size: int = 400,
        chunk_overlap: int = 60,
        **kwargs
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Processes any supported document into indexed chunks with source and page attribution.
        
        Returns:
            chunks: List of chunk dictionaries with:
                - chunk_index: int
                - page_number: int (page or section)
                - chapter: str (detected curriculum section or heading)
                - source_type: str ('pdf', 'docx', 'txt', 'image')
                - content: str
                - content_normalized: str
            metadata: Dict of document-level processing statistics
        """
        # 1. Extractor Stage
        extractor = get_extractor(file_type)
        logger.info(f"Extracting '{file_path}' using {extractor.__class__.__name__} for type '{file_type}'...")
        pages, metadata = extractor.extract(file_path, **kwargs)

        # 2. Normalizer Stage (Ensure clean Unicode and whitespace per page)
        for p in pages:
            raw_text = p.get("text", "")
            if p.get("is_ocr"):
                p["text"] = normalize_ocr_arabic_text(raw_text, preserve_tashkeel=True)
            else:
                p["text"] = raw_text.strip()

        # 3. Chunker Stage (Semantic, page-aware Arabic chunking)
        chunks = chunk_arabic_document(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        # 4. Attribute Chunk Source Type and Metadata
        for c in chunks:
            c["source_type"] = file_type

        logger.info(f"Document processing complete: {len(pages)} pages/sections, {len(chunks)} chunks created.")
        return chunks, metadata

# Global singleton instance
document_processor = DocumentProcessor()
