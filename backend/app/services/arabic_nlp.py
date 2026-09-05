import unicodedata
import re
from typing import List, Dict, Any, Optional

# Regex patterns for Arabic text processing
TASHKEEL_REGEX = re.compile(r'[\u0617-\u061A\u064B-\u0652]')
TATWEEL_REGEX = re.compile(r'\u0640')
PUNCTUATION_REGEX = re.compile(r'[،؛؟.,!?:;\"\'\(\)\[\]\{\}«»\-—_]')

# Patterns for Egyptian & Arab curriculum structure
HEADING_PATTERNS = [
    re.compile(r'^\s*(?:الوحدة|الباب|الفصل|المحور)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+)', re.UNICODE),
    re.compile(r'^\s*(?:الدرس|المبحث|المحاضرة)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+)', re.UNICODE),
    re.compile(r'^\s*(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)\s*[:\-]', re.UNICODE),
    re.compile(r'^\s*(?:قانون|نظرية|تعريف|ملاحظة هامة|ملخص|تطبيق|مسألة)\s*[:\-]', re.UNICODE),
]

def remove_tashkeel(text: str) -> str:
    """Removes Arabic diacritics (Harakat / Tashkeel)."""
    if not text:
        return ""
    return TASHKEEL_REGEX.sub('', text)

def remove_tatweel(text: str) -> str:
    """Removes Arabic kashida (Tatweel)."""
    if not text:
        return ""
    return TATWEEL_REGEX.sub('', text)

def normalize_arabic(text: str, remove_accents: bool = True) -> str:
    """
    Normalizes Arabic text for high-recall indexing and search:
    - Normalizes different forms of Alef (أ, إ, آ -> ا)
    - Normalizes Taa Marbuta (ة -> ه)
    - Normalizes Yaa / Alef Maksura (ى -> ي)
    - Normalizes Hamza variants (ؤ, ئ -> ء)
    - Removes Tashkeel and Tatweel
    """
    if not text:
        return ""
    
    text = remove_tatweel(text)
    if remove_accents:
        text = remove_tashkeel(text)
    
    # Normalize Alef
    text = re.sub(r'[إأآا]', 'ا', text)
    # Normalize Taa Marbuta
    text = re.sub(r'ة', 'ه', text)
    # Normalize Yaa
    text = re.sub(r'ى', 'ي', text)
    # Normalize Hamza
    text = re.sub(r'[ؤئ]', 'ء', text)
    
    # Clean redundant whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def normalize_ocr_arabic_text(text: str, preserve_tashkeel: bool = True) -> str:
    """
    Post-OCR normalization for Arabic and mixed Arabic/English text:
    - Normalizes Unicode presentation forms via NFKC (combining characters, ligatures)
    - Strips OCR control characters, zero-width spaces, directional marks (\u200B-\u200F, \uFEFF)
    - Removes Tatweel / Kashida (ـ)
    - Unifies forms of Alef (إ, أ, آ, ٱ -> ا)
    - Preserves Tashkeel / Harakat when preserve_tashkeel=True (protects grammatical and contextual meaning)
    - Normalizes common punctuation and OCR quotes
    - Cleans redundant spacing while preserving structural paragraph breaks
    """
    if not text:
        return ""

    # 1. Unicode NFKC normalization
    text = unicodedata.normalize('NFKC', text)

    # 2. Remove zero-width spaces, joiners, and directional formatting marks
    text = re.sub(r'[\u200B-\u200F\uFEFF]', '', text)

    # 3. Remove Tatweel / Kashida
    text = remove_tatweel(text)

    # 4. Normalize Alef variants
    text = re.sub(r'[إأآٱ]', 'ا', text)

    # 5. Optionally remove or preserve Tashkeel
    if not preserve_tashkeel:
        text = remove_tashkeel(text)

    # 6. Normalize common punctuation and OCR quotes
    text = text.replace('«', '"').replace('»', '"')
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('—', '-').replace('–', '-')

    # 7. Clean whitespace per line while preserving structural linebreaks
    lines = text.splitlines()
    cleaned_lines = []
    for line in lines:
        cleaned = re.sub(r'[ \t]+', ' ', line).strip()
        if cleaned:
            cleaned_lines.append(cleaned)

    return "\n".join(cleaned_lines)

def detect_heading(line: str) -> Optional[str]:
    """Detects if a line is a structural curriculum heading."""
    clean_line = line.strip()
    if not clean_line or len(clean_line) > 120:
        return None
    for pattern in HEADING_PATTERNS:
        if pattern.search(clean_line):
            return clean_line
    return None

def split_arabic_sentences(text: str) -> List[str]:
    """Splits Arabic text into coherent sentences without cutting within numbers or abbreviations."""
    # Split on Arabic and standard sentence terminators: . ، ؟ !
    sentences = re.split(r'(?<=[.!?؟\n])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def chunk_arabic_document(
    pages: List[Dict[str, Any]], 
    chunk_size: int = 500, 
    chunk_overlap: int = 80
) -> List[Dict[str, Any]]:
    """
    Semantic and page-aware chunking for Arabic textbooks.
    Maintains exact source page bounds and curriculum section headings.
    """
    chunks: List[Dict[str, Any]] = []
    chunk_index = 0
    current_chapter = "المقدمة"
    
    for page_data in pages:
        page_num = page_data["page_number"]
        page_text = page_data["text"].strip()
        if not page_text:
            continue
            
        lines = page_text.splitlines()
        page_paragraphs: List[str] = []
        current_para: List[str] = []
        
        for line in lines:
            line_str = line.strip()
            heading = detect_heading(line_str)
            if heading:
                current_chapter = heading
                if current_para:
                    page_paragraphs.append(" ".join(current_para))
                    current_para = []
                page_paragraphs.append(f"[{heading}]")
                continue
            
            if not line_str:
                if current_para:
                    page_paragraphs.append(" ".join(current_para))
                    current_para = []
            else:
                current_para.append(line_str)
                
        if current_para:
            page_paragraphs.append(" ".join(current_para))
            
        # Group paragraphs into chunks respecting size bounds
        current_chunk_words: List[str] = []
        current_word_count = 0
        
        for para in page_paragraphs:
            words = para.split()
            if not words:
                continue
                
            if current_word_count + len(words) > chunk_size and current_chunk_words:
                chunk_text = " ".join(current_chunk_words)
                chunks.append({
                    "chunk_index": chunk_index,
                    "page_number": page_num,
                    "chapter": current_chapter,
                    "content": chunk_text,
                    "content_normalized": normalize_arabic(chunk_text),
                })
                chunk_index += 1
                # Retain overlap from the end of the previous chunk
                overlap_words = current_chunk_words[-chunk_overlap:] if len(current_chunk_words) > chunk_overlap else []
                current_chunk_words = overlap_words + words
                current_word_count = len(current_chunk_words)
            else:
                current_chunk_words.extend(words)
                current_word_count += len(words)
                
        if current_chunk_words:
            chunk_text = " ".join(current_chunk_words)
            chunks.append({
                "chunk_index": chunk_index,
                "page_number": page_num,
                "chapter": current_chapter,
                "content": chunk_text,
                "content_normalized": normalize_arabic(chunk_text),
            })
            chunk_index += 1
            
    return chunks
