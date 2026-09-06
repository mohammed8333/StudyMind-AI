from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import init_db
from app.services.document_worker import document_worker
from app.api.v1 import auth, documents, tutor, quizzes, analytics, learning, planner, flashcards, exams, copilot

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables and start async background workers
    await init_db()
    await document_worker.start()
    yield
    # Shutdown logic
    await document_worker.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="StudyMind AI - محرك المذاكرة والتعلم الذكي للطلاب العرب (Arabic-First AI Study Engine)",
    lifespan=lifespan
)

from app.core.middleware import SecurityHeadersMiddleware

# Configure Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS with strict Allowlist from Settings and dynamic Vercel/Railway/egypttravelportal subdomains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_origin_regex=r"^https?:\/\/([a-zA-Z0-9-]+\.)*(vercel\.app|railway\.app|egypttravelportal\.com)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["المصادقة والمستخدمين (Auth)"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["المستندات والكتب (Documents)"])
app.include_router(tutor.router, prefix=f"{settings.API_V1_STR}/tutor", tags=["المعلم الذكي (AI Tutor)"])
app.include_router(quizzes.router, prefix=f"{settings.API_V1_STR}/quizzes", tags=["الاختبارات والتقييم (Quizzes)"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["التعلم التكيفي والإحصائيات (Analytics)"])
app.include_router(learning.router, prefix=f"{settings.API_V1_STR}/learning", tags=["التعلم التكيفي والجلسات العلاجية (Adaptive Learning)"])
app.include_router(planner.router, prefix=f"{settings.API_V1_STR}/planner", tags=["المخطط الدراسي الذكي (Study Planner)"])
app.include_router(flashcards.router, prefix=f"{settings.API_V1_STR}/flashcards", tags=["البطاقات التعليمية والتكرار المتباعد (Flashcards)"])
app.include_router(exams.router, prefix=f"{settings.API_V1_STR}/exams", tags=["محاكي الامتحانات (Exam Simulator)"])
app.include_router(copilot.router, prefix=f"{settings.API_V1_STR}/copilot", tags=["المساعد التعليمي الذكي (AI Learning Copilot)"])

@app.get("/", tags=["الحالة (Health)"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "description": "نظام StudyMind AI يعمل بنجاح وجاهز لخدمة الطلاب 🚀",
        "docs_url": "/docs"
    }
