import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "StudyMind AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment & Paths
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://studymind:studymind_secret@localhost:5432/studymind_db"
    SQLITE_FALLBACK_URL: str = f"sqlite+aiosqlite:///{BASE_DIR / 'studymind.db'}"
    USE_SQLITE_FALLBACK: bool = True
    
    # Security & CORS
    SECRET_KEY: str = "studymind_super_secret_jwt_key_2026_dev_mode"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,https://study.egypttravelportal.com"
    DISABLE_RATE_LIMIT: bool = False

    def get_cors_origins(self) -> list[str]:
        default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://study.egypttravelportal.com",
        ]
        if not self.ALLOWED_ORIGINS:
            return default_origins
        origins = [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
        for d in default_origins:
            if d not in origins:
                origins.append(d)
        return origins

    # Email & Verification (SMTP / OTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@egypttravelportal.com"
    SMTP_TLS: bool = True
    REQUIRE_EMAIL_VERIFICATION: bool = False

    # AI Engine
    LLM_PROVIDER: str = "groq"  # "groq" | "gemini" | "openrouter" | "ollama"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    
    # Groq (Super Fast & Free: https://console.groq.com/keys)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    
    # OpenRouter (Free models: https://openrouter.ai/keys)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"
    
    # Embeddings
    EMBEDDING_PROVIDER: str = "local"  # "gemini" | "ollama" | "local"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    
    # OCR Settings
    TESSERACT_CMD: str = os.getenv(
        "TESSERACT_CMD", 
        r"C:\Program Files\Tesseract-OCR\tesseract.exe" if os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe") else "tesseract"
    )
    OCR_LANG: str = "ara+eng"
    OCR_MIN_TEXT_CHARS: int = 40
    OCR_DPI: int = 300
    
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Ensure uploads directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
