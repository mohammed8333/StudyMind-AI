import pytest
from app.services.arabic_nlp import (
    normalize_arabic,
    remove_tashkeel,
    remove_tatweel,
    detect_heading,
    chunk_arabic_document
)

def test_remove_tashkeel():
    text = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    clean = remove_tashkeel(text)
    assert "بسم الله" in clean or "بسم" in clean
    assert "ِ" not in clean
    assert "َّ" not in clean

def test_remove_tatweel():
    text = "كـــــتـــــاب"
    assert remove_tatweel(text) == "كتاب"

def test_normalize_arabic():
    # Alef variants
    assert normalize_arabic("أحمد") == "احمد"
    assert normalize_arabic("إبراهيم") == "ابراهيم"
    assert normalize_arabic("آمال") == "امال"
    # Taa Marbuta & Yaa
    assert normalize_arabic("مدرسة") == "مدرسه"
    assert normalize_arabic("على") == "علي"

def test_detect_curriculum_heading():
    assert detect_heading("الفصل الأول: قوانين نيوتن للحركة") is not None
    assert detect_heading("الباب الثاني: الكيمياء العضوية") is not None
    assert detect_heading("الدرس الثالث: إعراب الفعل المضارع") is not None
    assert detect_heading("هذه مجرد جملة عادية في الكتاب") is None

def test_chunk_arabic_document():
    pages = [
        {
            "page_number": 1,
            "text": "الفصل الأول: الحركة الدائرية\nالجسم الذي يتحرك بسرعة ثابتة المقدار في مسار دائري يمتلك تسارعاً مركزياً. هذا التسارع يتجه دائماً نحو مركز الدائرة."
        },
        {
            "page_number": 2,
            "text": "قانون القوة الجاذبة المركزية:\nالقوة تساوي حاصل ضرب الكتلة في مربع السرعة مقسوماً على نصف القطر."
        }
    ]
    chunks = chunk_arabic_document(pages, chunk_size=50)
    assert len(chunks) >= 2
    assert chunks[0]["page_number"] == 1
    assert "الحركة الدائرية" in chunks[0]["chapter"] or "الفصل الأول" in chunks[0]["chapter"]
    assert chunks[1]["page_number"] == 2
