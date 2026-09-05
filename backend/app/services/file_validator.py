import io
import os
import re
import zipfile
import logging
from typing import Tuple, Optional
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Max upload size (50 MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

SUPPORTED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
}

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes filename against path traversal (../), special control characters, and null bytes.
    """
    if not filename:
        return "unnamed_document"
        
    # Remove any directory paths (both forward and backward slashes)
    clean_name = os.path.basename(filename)
    clean_name = clean_name.replace("/", "").replace("\\", "")
    
    # Remove null bytes and path traversal patterns
    clean_name = clean_name.replace("\x00", "").replace("..", "")
    
    # Strip dangerous shell/filesystem characters while preserving Arabic, English, dots, hyphens, and spaces
    clean_name = re.sub(r'[<>:"/\\|?*]', '_', clean_name).strip()
    
    return clean_name or "unnamed_document"


def validate_uploaded_file(
    filename: str,
    content: bytes,
    content_type: Optional[str] = None
) -> Tuple[str, str]:
    """
    Performs comprehensive backend file validation:
    1. Size validation
    2. Extension validation
    3. File signature / Magic bytes inspection (never trusts extension alone)
    4. Format-specific internal structural validation
    5. Path traversal sanitization
    
    Returns:
        (sanitized_filename, file_type) where file_type in ['pdf', 'docx', 'txt', 'image']
        
    Raises:
        HTTPException (400 or 413) if validation fails.
    """
    # 1. Size Validation
    file_size = len(content)
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف المرفوع فارغ (0 بايت)."
        )
        
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"حجم الملف يتجاوز الحد الأقصى المسموح به (50 ميجابايت). الحجم الحالي: {file_size // (1024*1024)} ميجابايت."
        )

    # 2. Filename Sanitization & Extension check
    safe_filename = sanitize_filename(filename)
    _, ext = os.path.splitext(safe_filename.lower())
    
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"نوع الملف غير مدعوم ({ext}). الصيغ المدعومة هي: PDF, DOCX, TXT, JPG, PNG."
        )

    declared_type = SUPPORTED_EXTENSIONS[ext]

    # Reject immediate executable signatures regardless of extension
    if content.startswith(b'MZ') or content.startswith(b'\x7fELF') or content.startswith(b'#!'):
        logger.warning(f"Security Alert: Executable signature detected in uploaded file '{filename}'.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="فشل التحقق الأمني: تم رفض الملف لاحتوائه على كود تنفيذي غير مسموح."
        )

    # 3. Magic Bytes / Signature Verification
    if declared_type == "pdf":
        # Standard PDF starts with %PDF- (within first 1024 bytes according to spec)
        header_sample = content[:1024]
        if b'%PDF-' not in header_sample:
            logger.warning(f"File '{filename}' has .pdf extension but lacks '%PDF-' signature.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="الملف المرفوع تالف أو لا يتطابق مع توقيع ملفات الـ PDF الأصلي."
            )

    elif declared_type == "docx":
        # Word documents are zip packages starting with PK\x03\x04
        if not content.startswith(b'PK\x03\x04'):
            logger.warning(f"File '{filename}' has .docx extension but lacks 'PK' zip signature.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="الملف المرفوع تالف أو ليس مستند Word (.docx) حقيقي."
            )
        # Deep inspection: Must contain internal docx structure
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                namelist = zf.namelist()
                has_content_types = "[Content_Types].xml" in namelist
                has_word_dir = any(name.startswith("word/") for name in namelist)
                if not (has_content_types or has_word_dir):
                    raise ValueError("Missing Word XML structures")
        except Exception as e:
            logger.warning(f"File '{filename}' failed docx zip archive verification: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ملف الـ DOCX تالف أو لا يحتوي على بنية مستندات Word الصحيحة."
            )

    elif declared_type == "image":
        if ext == ".png":
            if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="الملف لا يطابق توقيع صور PNG الأصلية."
                )
        elif ext in [".jpg", ".jpeg"]:
            if not content.startswith(b'\xFF\xD8\xFF'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="الملف لا يطابق توقيع صور JPEG/JPG الأصلية."
                )

    elif declared_type == "txt":
        # Plain text must not contain high density of binary null bytes
        null_count = content.count(b'\x00')
        if null_count > 5 and (null_count / max(len(content), 1) > 0.05):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="الملف المرفوع يحتوي على بيانات ثنائية غير نصية."
            )
        # Verify it can be decoded into text
        decoded = False
        for enc in ['utf-8', 'utf-8-sig', 'utf-16', 'cp1256', 'latin-1']:
            try:
                content.decode(enc)
                decoded = True
                break
            except Exception:
                continue
        if not decoded:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="تعذر فك ترميز الملف النصي. يرجى التأكد من حفظه بترميز UTF-8 أو النص القياسي."
            )

    return safe_filename, declared_type
