import os
import logging
from typing import List, Dict, Any, Tuple
from app.services.extractors.base import BaseDocumentExtractor

logger = logging.getLogger(__name__)

class DocxExtractor(BaseDocumentExtractor):
    """
    Extracts text from Microsoft Word documents (.docx).
    Preserves document structure:
    - Headings (Heading 1, 2, 3, Title)
    - Paragraphs
    - Bullet and Numbered Lists
    - Tables (formatted as structured markdown tables)
    Partitions content into coherent virtual pages/sections for citation.
    """

    def extract(self, file_path: str, **kwargs) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"DOCX file not found: {file_path}")

        try:
            return self._extract_with_docx(file_path)
        except Exception as e:
            logger.warning(f"python-docx parsing failed ({e}). Attempting internal XML fallback...")
            return self._extract_with_xml_fallback(file_path)

    def _extract_with_docx(self, file_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        import docx
        from docx.text.paragraph import Paragraph
        from docx.table import Table
        from docx.oxml.text.paragraph import CT_P
        from docx.oxml.table import CT_Tbl

        doc = docx.Document(file_path)
        
        blocks: List[str] = []
        headings_count = 0
        tables_count = 0
        lists_count = 0

        # Traverse document elements in exact visual sequence
        for child in doc.element.body.iterchildren():
            if isinstance(child, CT_P):
                p = Paragraph(child, doc)
                text = p.text.strip()
                if not text:
                    continue

                style_name = (p.style.name or "").lower() if p.style else ""
                
                # 1. Headings
                if "heading" in style_name or "title" in style_name:
                    headings_count += 1
                    blocks.append(f"[{text}]")
                # 2. Lists
                elif "list" in style_name or "bullet" in style_name:
                    lists_count += 1
                    blocks.append(f"• {text}")
                # 3. Regular Paragraphs
                else:
                    blocks.append(text)

            elif isinstance(child, CT_Tbl):
                # 4. Tables
                t = Table(child, doc)
                tables_count += 1
                table_lines: List[str] = []
                for row_idx, row in enumerate(t.rows):
                    cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                    row_str = "| " + " | ".join(cells) + " |"
                    table_lines.append(row_str)
                    if row_idx == 0:
                        separator = "| " + " | ".join(["---"] * len(cells)) + " |"
                        table_lines.append(separator)
                
                if table_lines:
                    blocks.append("\n".join(table_lines))

        # Group blocks into virtual pages (~400-500 words or on major headings)
        pages: List[Dict[str, Any]] = []
        current_page_blocks: List[str] = []
        current_word_count = 0
        page_num = 1

        for block in blocks:
            words_in_block = len(block.split())
            is_major_heading = block.startswith("[") and block.endswith("]")

            if (current_word_count + words_in_block > 450 and current_page_blocks) or (is_major_heading and current_word_count > 250):
                page_text = "\n\n".join(current_page_blocks)
                pages.append({
                    "page_number": page_num,
                    "text": page_text,
                    "char_count": len(page_text),
                    "source_type": "docx",
                    "is_ocr": False
                })
                page_num += 1
                current_page_blocks = [block]
                current_word_count = words_in_block
            else:
                current_page_blocks.append(block)
                current_word_count += words_in_block

        if current_page_blocks:
            page_text = "\n\n".join(current_page_blocks)
            pages.append({
                "page_number": page_num,
                "text": page_text,
                "char_count": len(page_text),
                "source_type": "docx",
                "is_ocr": False
            })

        total_chars = sum(p["char_count"] for p in pages)
        metadata = {
            "total_pages": len(pages),
            "total_characters": total_chars,
            "headings_count": headings_count,
            "tables_count": tables_count,
            "lists_count": lists_count,
            "source_type": "docx",
            "is_scanned": False,
            "ocr_applied": False,
        }

        return pages, metadata

    def _extract_with_xml_fallback(self, file_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Fallback extractor using standard library zipfile and XML parser."""
        import zipfile
        import xml.etree.ElementTree as ET

        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        blocks: List[str] = []

        with zipfile.ZipFile(file_path) as zf:
            xml_content = zf.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            body = tree.find('w:body', namespaces)
            if body is not None:
                for elem in body:
                    if elem.tag.endswith('p'):
                        texts = [node.text for node in elem.iter() if node.text]
                        p_text = "".join(texts).strip()
                        if p_text:
                            blocks.append(p_text)
                    elif elem.tag.endswith('tbl'):
                        for row in elem.iter(f"{{{namespaces['w']}}}tr"):
                            cells = []
                            for cell in row.iter(f"{{{namespaces['w']}}}tc"):
                                cell_texts = [n.text for n in cell.iter() if n.text]
                                cells.append("".join(cell_texts).strip())
                            if cells:
                                blocks.append("| " + " | ".join(cells) + " |")

        full_text = "\n\n".join(blocks)
        pages = [{
            "page_number": 1,
            "text": full_text,
            "char_count": len(full_text),
            "source_type": "docx",
            "is_ocr": False
        }]
        metadata = {
            "total_pages": 1,
            "total_characters": len(full_text),
            "source_type": "docx",
            "is_scanned": False,
            "ocr_applied": False,
        }
        return pages, metadata
