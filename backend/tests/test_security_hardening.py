import os
import pytest
import pytest_asyncio
from datetime import timedelta
from httpx import AsyncClient, ASGITransport
from jose import jwt

from app.main import app
from app.core.config import settings
from app.core.database import init_db
from app.core.security import create_access_token
from app.core.rate_limiter import rate_limiter
from app.models.document import Document
from app.models.quiz import Quiz, QuizQuestion
from app.core.database import AsyncSessionLocal

@pytest_asyncio.fixture(autouse=True)
async def setup_db_and_clean_limits():
    await init_db()
    rate_limiter.reset()
    yield
    rate_limiter.reset()

async def get_or_create_user(ac: AsyncClient, email: str, name: str) -> str:
    await ac.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": name,
        "grade_or_level": "الثانوية العامة"
    })
    login_res = await ac.post("/api/v1/auth/login", data={
        "username": email,
        "password": "Password123!"
    })
    return login_res.json()["access_token"]

# -------------------------------------------------------------
# 1. Authentication & JWT Validation Tests
# -------------------------------------------------------------

@pytest.mark.asyncio
async def test_expired_jwt_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create an expired token (issued in the past)
        expired_token = create_access_token(subject=1, expires_delta=timedelta(minutes=-10))
        headers = {"Authorization": f"Bearer {expired_token}"}
        
        res = await ac.get("/api/v1/auth/me", headers=headers)
        assert res.status_code == 401
        assert "تعذر التحقق" in res.json()["detail"]

@pytest.mark.asyncio
async def test_malformed_jwt_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        headers = {"Authorization": "Bearer malformed.garbage.token"}
        res = await ac.get("/api/v1/auth/me", headers=headers)
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_bad_signature_jwt_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Token signed with fake secret key
        fake_payload = {"sub": "1", "exp": 9999999999}
        fake_token = jwt.encode(fake_payload, "completely_wrong_secret_key", algorithm="HS256")
        headers = {"Authorization": f"Bearer {fake_token}"}
        
        res = await ac.get("/api/v1/auth/me", headers=headers)
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_user_enumeration_generic_response():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/v1/auth/login", data={
            "username": "non_existent_student_9999@example.com",
            "password": "AnyPassword123!"
        })
        assert res.status_code == 401
        assert res.json()["detail"] == "بيانات الدخول غير صحيحة."

@pytest.mark.asyncio
async def test_password_length_validation_on_register():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Password too short (< 8 chars)
        res = await ac.post("/api/v1/auth/register", json={
            "email": "short_pw@example.com",
            "password": "short",
            "full_name": "مستخدم قصير",
            "grade_or_level": "أول ثانوي"
        })
        assert res.status_code == 422

# -------------------------------------------------------------
# 2. Comprehensive IDOR Protection Tests
# -------------------------------------------------------------

@pytest.mark.asyncio
async def test_idor_quiz_submit_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "student_a_idor@example.com", "طالب أ")
        token_b = await get_or_create_user(ac, "student_b_idor@example.com", "طالب ب")

        # 1. Create a Document and Quiz belonging to Student A
        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers={"Authorization": f"Bearer {token_a}"},
            data={"title": "مذكرة فيزياء طالب أ", "subject": "الفيزياء"},
            files={"file": ("notes_a.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        doc_a_id = upload_res.json()["id"]

        # Insert a quiz record linked to doc_a
        async with AsyncSessionLocal() as db:
            quiz_a = Quiz(
                document_id=doc_a_id,
                title="اختبار طالب أ الخاص",
                difficulty="medium"
            )
            db.add(quiz_a)
            await db.commit()
            await db.refresh(quiz_a)
            quiz_a_id = quiz_a.id

        # 2. Student B tries to submit answers to Student A's Quiz (IDOR attack)
        submit_res = await ac.post(
            f"/api/v1/quizzes/{quiz_a_id}/submit",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"answers": [], "time_taken_seconds": 30}
        )
        assert submit_res.status_code == 403
        assert "صلاحية" in submit_res.json()["detail"]

@pytest.mark.asyncio
async def test_idor_tutor_summary_and_chat_history_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "owner_tutor@example.com", "المالك أ")
        token_b = await get_or_create_user(ac, "attacker_tutor@example.com", "المهاجم ب")

        # Create Document for User A
        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers={"Authorization": f"Bearer {token_a}"},
            data={"title": "مذكرة سرية للمالك أ", "subject": "الفيزياء"},
            files={"file": ("secret_a.pdf", pdf_bytes, "application/pdf")}
        )
        doc_a_id = upload_res.json()["id"]

        # Student B attempts to get AI summary of Student A's document
        summary_res = await ac.post(
            f"/api/v1/tutor/summary/{doc_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert summary_res.status_code == 404

        # Student B attempts to get chat history of Student A's document
        chat_res = await ac.get(
            f"/api/v1/tutor/history/{doc_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert chat_res.status_code == 404

        # Student B attempts to delete chat history of Student A's document
        del_chat_res = await ac.delete(
            f"/api/v1/tutor/history/{doc_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert del_chat_res.status_code == 404

@pytest.mark.asyncio
async def test_idor_analytics_document_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "owner_analytics@example.com", "المالك للتحليلات")
        token_b = await get_or_create_user(ac, "attacker_analytics@example.com", "المهاجم للتحليلات")

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers={"Authorization": f"Bearer {token_a}"},
            data={"title": "مذكرة تحليلات", "subject": "الفيزياء"},
            files={"file": ("analytics_doc.pdf", pdf_bytes, "application/pdf")}
        )
        doc_a_id = upload_res.json()["id"]

        # Student B attempts to query document analytics for Student A's document
        analytics_res = await ac.get(
            f"/api/v1/analytics/document/{doc_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert analytics_res.status_code == 404

# -------------------------------------------------------------
# 3. Rate Limiting Tests
# -------------------------------------------------------------

@pytest.mark.asyncio
async def test_rate_limiting_on_login():
    import uuid
    run_id = uuid.uuid4().hex[:6]
    test_email = f"ratelimit_login_{run_id}@example.com"
    rate_limiter.reset()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register a valid user
        await ac.post("/api/v1/auth/register", json={
            "email": test_email,
            "password": "Password123!",
            "full_name": "مستخدم الليمت"
        })

        # Login limit is 5 requests per 60s
        for _ in range(5):
            res = await ac.post("/api/v1/auth/login", data={
                "username": test_email,
                "password": "Password123!"
            })
            assert res.status_code == 200

        # 6th login within the window must trigger 429 Too Many Requests
        blocked_res = await ac.post("/api/v1/auth/login", data={
            "username": test_email,
            "password": "Password123!"
        })
        assert blocked_res.status_code == 429
        assert "تم تجاوز الحد المسموح" in blocked_res.json()["detail"]
        assert "Retry-After" in blocked_res.headers
        assert blocked_res.headers["X-RateLimit-Limit"] == "5"

@pytest.mark.asyncio
async def test_rate_limiting_on_register():
    import uuid
    run_id = uuid.uuid4().hex[:6]
    rate_limiter.reset()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register limit is 3 requests per 60s
        for i in range(3):
            res = await ac.post("/api/v1/auth/register", json={
                "email": f"ratelimit_reg_{run_id}_{i}@example.com",
                "password": "Password123!",
                "full_name": f"مستخدم {i}"
            })
            assert res.status_code == 201

        # 4th register must trigger 429
        blocked_res = await ac.post("/api/v1/auth/register", json={
            "email": f"ratelimit_reg_{run_id}_blocked@example.com",
            "password": "Password123!",
            "full_name": "مستخدم محظور"
        })
        assert blocked_res.status_code == 429
        assert "تم تجاوز الحد المسموح" in blocked_res.json()["detail"]
        assert blocked_res.headers["X-RateLimit-Limit"] == "3"

# -------------------------------------------------------------
# 4. Security Headers & CORS Tests
# -------------------------------------------------------------

@pytest.mark.asyncio
async def test_security_headers_present():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/")
        assert res.status_code == 200
        headers = res.headers
        
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "camera=()" in headers.get("Permissions-Policy", "")
        assert headers.get("X-XSS-Protection") == "0"
        assert "default-src 'none'" in headers.get("Content-Security-Policy", "")

@pytest.mark.asyncio
async def test_cors_allowlist_enforced():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Allowed origin (localhost:3000)
        allowed_res = await ac.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST"
            }
        )
        assert allowed_res.headers.get("access-control-allow-origin") == "http://localhost:3000"

        # 2. Disallowed origin (evil-site.com)
        disallowed_res = await ac.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "http://evil-site.com",
                "Access-Control-Request-Method": "POST"
            }
        )
        assert disallowed_res.headers.get("access-control-allow-origin") is None
