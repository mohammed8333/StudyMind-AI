import re
from typing import Tuple

# Common prompt injection and jailbreak patterns (English and Arabic)
PROMPT_INJECTION_PATTERNS = [
    r"(?i)ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+(instructions|prompts|rules)",
    r"(?i)disregard\s+(all\s+|the\s+)?(previous|prior|above)\s+(instructions|prompts|rules)",
    r"(?i)bypass\s+(all\s+|the\s+)?(previous|prior|above)\s+(instructions|prompts|rules)",
    r"(?i)forget\s+(everything|all\s+instructions)",
    r"(?i)system\s+prompt\s*:",
    r"(?i)override\s+(all\s+|the\s+)?instructions",
    r"(?i)you\s+are\s+now\s+(an\s+unrestricted|a\s+different|in\s+developer\s+mode)",
    r"(?i)developer\s+mode\s+(enabled|on)",
    r"(?i)print\s+(the\s+)?system\s+prompt",
    r"(?i)reveal\s+(the\s+)?system\s+prompt",
    # Arabic adversarial injection patterns
    r"تجاهل\s+(كافة|جميع|كل)?\s*(التعليمات|الأوامر|التوجيهات|ما\s+سبق)",
    r"انسَ\s+(كافة|جميع|كل)?\s*(التعليمات|الأوامر|التوجيهات)",
    r"تخطى\s+(كافة|جميع|كل)?\s*(التعليمات|الأوامر|التوجيهات)",
    r"أنت\s+الآن\s+(غير\s+مقيد|في\s+وضع\s+المطور)",
    r"اطبع\s+(التعليمات|أوامر\s+النظام|البرومبت)",
    r"اكشف\s+(التعليمات|أوامر\s+النظام|البرومبت)",
]

COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in PROMPT_INJECTION_PATTERNS]


def sanitize_user_input(text: str) -> str:
    """
    Sanitizes user inputs against prompt injection:
    1. Escapes or neutralizes XML/HTML breakout tags (<student_query>, </student_query>, etc.)
    2. Strips or defangs adversarial instruction override commands
    3. Normalizes excessive control characters
    """
    if not text or not isinstance(text, str):
        return ""

    cleaned = text.strip()

    # Escape XML boundary delimiters so users cannot close/open custom tags
    cleaned = cleaned.replace("</student_query>", "&lt;/student_query&gt;")
    cleaned = cleaned.replace("<student_query>", "&lt;student_query&gt;")
    cleaned = cleaned.replace("</system>", "&lt;/system&gt;")
    cleaned = cleaned.replace("<system>", "&lt;system&gt;")
    cleaned = cleaned.replace("</context>", "&lt;/context&gt;")
    cleaned = cleaned.replace("<context>", "&lt;context&gt;")

    # Defang detected injection patterns by neutral replacement
    for pattern in COMPILED_PATTERNS:
        cleaned = pattern.sub("[محتوى محظور - محاولة تجاوز تعليمات النظام]", cleaned)

    return cleaned


def wrap_with_prompt_boundary(text: str, tag: str = "student_query") -> str:
    """
    Wraps sanitized user text in a strict XML bounding tag to prevent prompt breakout.
    """
    sanitized = sanitize_user_input(text)
    return f"<{tag}>\n{sanitized}\n</{tag}>"
