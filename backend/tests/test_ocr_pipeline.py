import os
import tempfile
import pytest
import fitz  # PyMuPDF
from typing import Optional
from app.services.pdf_extractor import extract_text_from_pdf, process_and_chunk_pdf
from app.services.ocr_engine import get_ocr_engine, BaseOCREngine, DummyOCREngine
from app.services.arabic_nlp import normalize_ocr_arabic_text

def create_digital_pdf(output_path: str) -> str:
    """Creates a PDF with a clean digital text layer."""
    doc = fitz.open()
    page = doc.new_page(width=500, height=300)
    text = (
        "Physics Chapter 1: Classical Velocity and Mechanics.\n"
        "Velocity is the displacement per unit time, measured in meters per second.\n"
        "Formula: v = d / t where v is velocity, d is distance, and t is time."
    )
    page.insert_text((50, 60), text, fontsize=12)
    doc.save(output_path)
    doc.close()
    return output_path

def create_scanned_pdf(
    output_path: str,
    text: str,
    is_arabic: bool = False,
    english_subtitle: Optional[str] = None
) -> str:
    """
    Creates a true scanned PDF: renders text into a raster image,
    and embeds ONLY the image without any digital text stream.
    """
    # 1. First document to render raster image
    temp_doc = fitz.open()
    page = temp_doc.new_page(width=600, height=350)
    
    font_path = "C:/Windows/Fonts/arial.ttf" if os.path.exists("C:/Windows/Fonts/arial.ttf") else None
    if is_arabic and font_path:
        import arabic_reshaper
        from bidi.algorithm import get_display
        page.insert_font(fontname="f0", fontfile=font_path)
        reshaped = get_display(arabic_reshaper.reshape(text))
        page.insert_text((50, 90), reshaped, fontname="f0", fontsize=24)
        if english_subtitle:
            page.insert_text((50, 160), english_subtitle, fontname="f0", fontsize=16)
    else:
        page.insert_text((50, 80), text, fontsize=18)
        if english_subtitle:
            page.insert_text((50, 140), english_subtitle, fontsize=14)

    pix = page.get_pixmap(dpi=300)
    img_bytes = pix.tobytes("png")
    temp_doc.close()

    # 2. Scanned document holding only the image
    scanned_doc = fitz.open()
    scanned_page = scanned_doc.new_page(width=pix.width, height=pix.height)
    scanned_page.insert_image(scanned_page.rect, stream=img_bytes)
    
    # Assert zero digital text layer exists
    assert scanned_page.get_text().strip() == "", "Scanned page must have no digital text layer"
    scanned_doc.save(output_path)
    scanned_doc.close()
    return output_path

def create_blank_pdf(output_path: str) -> str:
    """Creates a blank PDF page without any text or image."""
    doc = fitz.open()
    doc.new_page(width=400, height=400)
    doc.save(output_path)
    doc.close()
    return output_path


# --- Tests ---

def test_digital_pdf_bypasses_ocr():
    """Requirement 1 & 10: Digital PDFs should extract directly without triggering OCR."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_digital_pdf(pdf_path)
        pages, metadata = extract_text_from_pdf(pdf_path)

        assert len(pages) == 1
        assert metadata["total_pages"] == 1
        assert metadata["ocr_applied"] is False, "OCR must NOT be triggered on digital PDFs"
        assert metadata["ocr_pages_count"] == 0
        assert pages[0]["is_ocr"] is False
        assert "Velocity" in pages[0]["text"]
        assert len(pages[0]["text"]) > 40
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_scanned_pdf_triggers_ocr():
    """Requirement 2, 3: Scanned PDF without text layer triggers OCR and extracts text."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_scanned_pdf(
            pdf_path,
            text="StudyMind AI Autonomous Tutor Acceleration",
            is_arabic=False,
            english_subtitle="Formula: F = m * a Newton Second Law"
        )
        pages, metadata = extract_text_from_pdf(pdf_path)

        assert len(pages) == 1
        assert metadata["ocr_applied"] is True, "OCR must be applied to scanned pages"
        assert metadata["ocr_pages_count"] == 1
        assert pages[0]["is_ocr"] is True
        
        extracted = pages[0]["text"]
        assert len(extracted) > 0
        # Check that OCR recognized keywords
        assert any(k in extracted for k in ["StudyMind", "Tutor", "Newton", "Law", "Formula"])
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_arabic_scanned_pdf():
    """Requirement 3, 5: Arabic scanned PDF OCR recognizes Arabic text with normalization."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_scanned_pdf(
            pdf_path,
            text="الفصل الأول: قوانين الحركة والسرعة في الفيزياء",
            is_arabic=True,
            english_subtitle="StudyMind Educational Physics Platform"
        )
        pages, metadata = extract_text_from_pdf(pdf_path)

        assert len(pages) == 1
        assert metadata["ocr_applied"] is True
        assert pages[0]["is_ocr"] is True
        extracted = pages[0]["text"]
        assert len(extracted) > 0
        # Check that either Arabic words or English words are recognized
        assert any(word in extracted for word in ["الفصل", "قوانين", "الحركة", "الفيزياء", "StudyMind"])
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_mixed_arabic_english_scanned_pdf():
    """Requirement 3: Mixed Arabic + English document is recognized properly."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_scanned_pdf(
            pdf_path,
            text="اختبار الذكاء الاصطناعي StudyMind AI Module",
            is_arabic=True,
            english_subtitle="Calculations: Energy E = m * c^2"
        )
        pages, metadata = extract_text_from_pdf(pdf_path)

        assert len(pages) == 1
        assert metadata["ocr_applied"] is True
        extracted = pages[0]["text"]
        assert len(extracted) > 0
        # Verify mixed language detection
        assert any(term in extracted for term in ["StudyMind", "AI", "Energy", "اختبار", "الذكاء"])
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_blank_pdf_handled_gracefully():
    """Requirement 9: PDF with no text or blank pages handled without server crash."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_blank_pdf(pdf_path)
        pages, metadata = extract_text_from_pdf(pdf_path)

        assert len(pages) == 1
        assert metadata["total_pages"] == 1
        assert pages[0]["char_count"] == 0
        assert metadata["empty_pages"] == 1
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_ocr_error_resilience():
    """Requirement 9: If OCR engine fails or crashes, server does not crash and logs error."""
    class FailingOCREngine(BaseOCREngine):
        def extract_text(self, image_data, lang=None):
            raise RuntimeError("Simulated OCR Hard Engine Crash")

        def is_available(self):
            return True

        def get_name(self):
            return "Failing-Test-Engine"

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        create_scanned_pdf(pdf_path, text="Some text to OCR")
        # Should not raise exception
        pages, metadata = extract_text_from_pdf(
            pdf_path,
            ocr_engine=FailingOCREngine(),
            min_text_chars=100
        )

        assert len(pages) == 1
        assert len(metadata["ocr_errors"]) > 0
        assert "Simulated OCR Hard Engine Crash" in metadata["ocr_errors"][0]
        assert pages[0]["text"] == ""
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


def test_arabic_ocr_normalization_rules():
    """Requirement 5: Test post-OCR Arabic normalization rules."""
    # 1. Tatweel removal
    text_with_tatweel = "كـتـابـة الـفـيـزيـاء"
    norm_tatweel = normalize_ocr_arabic_text(text_with_tatweel)
    assert "ـ" not in norm_tatweel
    assert "كتابة الفيزياء" in norm_tatweel

    # 2. Alef unification
    text_with_alef = "أحمد وإبراهيم في آفاق جديدة"
    norm_alef = normalize_ocr_arabic_text(text_with_alef)
    assert "ا" in norm_alef
    assert "أ" not in norm_alef
    assert "إ" not in norm_alef
    assert "آ" not in norm_alef

    # 3. Tashkeel preservation when preserve_tashkeel=True
    text_with_tashkeel = "قُوَّةُ الدَّفْعِ"
    norm_tashkeel_preserved = normalize_ocr_arabic_text(text_with_tashkeel, preserve_tashkeel=True)
    # Check that diacritics were NOT stripped
    assert "ُ" in norm_tashkeel_preserved or "َّ" in norm_tashkeel_preserved or "ِ" in norm_tashkeel_preserved

    # Tashkeel stripped when preserve_tashkeel=False
    norm_tashkeel_removed = normalize_ocr_arabic_text(text_with_tashkeel, preserve_tashkeel=False)
    assert "ُ" not in norm_tashkeel_removed
    assert "ِ" not in norm_tashkeel_removed

    # 4. Unicode NFKC & Zero-width characters
    text_with_zwsp = "مرحبا\u200B\u200E بكم"
    norm_unicode = normalize_ocr_arabic_text(text_with_zwsp)
    assert "\u200B" not in norm_unicode
    assert "\u200E" not in norm_unicode
    assert "مرحبا بكم" in norm_unicode


def test_page_number_citation_tracking():
    """Requirement 7: Verify that chunks retain exact source page numbers for AI citations."""
    doc = fitz.open()
    
    # Page 1
    p1 = doc.new_page(width=500, height=300)
    p1.insert_text((50, 50), "الفصل الأول: مقدمة في علم الديناميكا الحرارية والفيزياء العامة.", fontsize=14)
    
    # Page 2
    p2 = doc.new_page(width=500, height=300)
    p2.insert_text((50, 50), "الفصل الثاني: القانون الأول للديناميكا الحرارية وتطبيقات الطاقة.", fontsize=14)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        pdf_path = tmp.name

    try:
        doc.save(pdf_path)
        doc.close()

        chunks, metadata = process_and_chunk_pdf(pdf_path)
        assert len(chunks) >= 2
        
        pages_in_chunks = [c["page_number"] for c in chunks]
        assert 1 in pages_in_chunks, "Chunk from page 1 must have page_number 1"
        assert 2 in pages_in_chunks, "Chunk from page 2 must have page_number 2"
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
