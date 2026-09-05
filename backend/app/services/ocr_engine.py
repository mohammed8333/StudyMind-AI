import os
import subprocess
import tempfile
import logging
from abc import ABC, abstractmethod
from typing import Union, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class BaseOCREngine(ABC):
    """Abstract Base Class for OCR engines allowing pluggable implementations."""
    
    @abstractmethod
    def extract_text(self, image_data: Union[bytes, str], lang: Optional[str] = None) -> str:
        """Extract text from raw image bytes or an image file path."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the OCR engine and its language data are ready to use."""
        pass

    @abstractmethod
    def get_name(self) -> str:
        """Return engine identifier."""
        pass


class TesseractOCREngine(BaseOCREngine):
    """
    Tesseract OCR implementation supporting Arabic, English, and mixed documents.
    Works natively via subprocess with automatic binary discovery and graceful error handling.
    """
    
    def __init__(self, tesseract_cmd: Optional[str] = None, default_lang: Optional[str] = None):
        self.tesseract_cmd = tesseract_cmd or settings.TESSERACT_CMD
        self.default_lang = default_lang or settings.OCR_LANG
        self._available: Optional[bool] = None
        self._try_init_pytesseract()

    def _try_init_pytesseract(self):
        """Configure pytesseract if installed in the environment."""
        try:
            import pytesseract
            if self.tesseract_cmd and os.path.exists(self.tesseract_cmd):
                pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd
        except ImportError:
            pass

    def get_name(self) -> str:
        return "Tesseract-OCR"

    def is_available(self) -> bool:
        """Checks if Tesseract binary can be invoked."""
        if self._available is not None:
            return self._available
            
        cmd = self.tesseract_cmd
        try:
            res = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=5)
            self._available = (res.returncode == 0)
            if self._available:
                logger.info(f"Tesseract OCR is available at: {cmd}")
            else:
                logger.warning(f"Tesseract command returned non-zero code: {res.returncode}")
        except Exception as e:
            logger.warning(f"Tesseract OCR not accessible at '{cmd}': {e}")
            self._available = False
            
        return self._available

    def extract_text(self, image_data: Union[bytes, str], lang: Optional[str] = None) -> str:
        """
        Extracts text from image_data (bytes or filepath) using Tesseract.
        Handles errors gracefully without crashing the application.
        """
        if not self.is_available():
            logger.warning("OCR requested but Tesseract is not available.")
            return ""

        target_lang = lang or self.default_lang
        temp_file_created = False
        image_path: str = ""

        try:
            if isinstance(image_data, bytes):
                # Save bytes to a temporary file
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp.write(image_data)
                    image_path = tmp.name
                    temp_file_created = True
            elif isinstance(image_data, str):
                image_path = image_data
            else:
                logger.error(f"Unsupported image_data type: {type(image_data)}")
                return ""

            # Run Tesseract with auto page segmentation and LSTM engine
            cmd = [
                self.tesseract_cmd,
                image_path,
                "stdout",
                "-l", target_lang,
                "--psm", "3",
                "--oem", "1"
            ]

            res = subprocess.run(
                cmd,
                capture_output=True,
                timeout=45,
                check=False
            )

            if res.returncode != 0:
                err_msg = res.stderr.decode("utf-8", errors="replace").strip()
                logger.error(f"Tesseract returned error (code {res.returncode}): {err_msg}")
                # Fallback: if ara+eng fails because a language file is missing, try English or Arabic individually
                if "+" in target_lang:
                    for fallback_lang in target_lang.split("+"):
                        fallback_cmd = [self.tesseract_cmd, image_path, "stdout", "-l", fallback_lang, "--psm", "3"]
                        fb_res = subprocess.run(fallback_cmd, capture_output=True, timeout=30, check=False)
                        if fb_res.returncode == 0:
                            return fb_res.stdout.decode("utf-8", errors="replace").strip()
                return ""

            raw_text = res.stdout.decode("utf-8", errors="replace")
            return raw_text.strip()

        except subprocess.TimeoutExpired:
            logger.error(f"Tesseract OCR timed out on image: {image_path}")
            return ""
        except Exception as e:
            logger.error(f"Unexpected error during OCR extraction: {e}", exc_info=True)
            return ""
        finally:
            if temp_file_created and image_path and os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except Exception:
                    pass


class DummyOCREngine(BaseOCREngine):
    """Mock OCR engine for automated testing and fallback environments."""
    def __init__(self, predefined_text: str = "محتوى مستخرج عبر OCR للاختبار"):
        self.predefined_text = predefined_text

    def get_name(self) -> str:
        return "Dummy-OCR"

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_data: Union[bytes, str], lang: Optional[str] = None) -> str:
        return self.predefined_text


_GLOBAL_OCR_ENGINE: Optional[BaseOCREngine] = None

def get_ocr_engine() -> BaseOCREngine:
    """Factory function to get the configured OCR engine singleton."""
    global _GLOBAL_OCR_ENGINE
    if _GLOBAL_OCR_ENGINE is None:
        _GLOBAL_OCR_ENGINE = TesseractOCREngine()
    return _GLOBAL_OCR_ENGINE
