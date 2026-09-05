import os
import io
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.core.rate_limiter import rate_limiter
from app.models.document import Document, DocumentChunk
from app.services.document_worker import document_worker

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()
    rate_limiter.reset()
    document_worker.ensure_started()
    yield
    rate_limiter.reset()

async def get_or_create_user(client: AsyncClient, email: str, name: str, password: str = "Password123!Safe") -> str:
    for pwd in [password, "Password123!"]:
        login_res = await client.post(
            "/api/v1/auth/login",
            data={"username": email, "password": pwd}
        )
        if login_res.status_code == 200:
            return login_res.json()["access_token"]

    # Register new user
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": name,
            "grade_or_level": "الثانوية العامة"
        }
    )
    # Login to get token
    login_final = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password}
    )
    return login_final.json()["access_token"]

@pytest.mark.asyncio
async def test_async_upload_returns_immediately_with_pending():
    """
    Asserts requirement:
    Upload returns immediately without blocking HTTP connection.
    Initial state is PENDING with progress_percentage 0.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "async_student@example.com", "طالب غير متزامن")
        headers = {"Authorization": f"Bearer {token}"}

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers,
            data={"title": "مذكرة فيزياء غير متزامنة", "subject": "الفيزياء"},
            files={"file": ("async_physics.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        data = upload_res.json()
        doc_id = data["id"]

        # 1. Returned immediately with PENDING status
        assert data["status"].upper() == "PENDING"
        assert data["progress_percentage"] == 0
        assert "انتظار" in data["progress_stage"]

        # 2. Worker completes in background
        final_status = await document_worker.wait_for_document(doc_id, timeout=10.0)
        assert (final_status or "").upper() == "READY"

        # 3. Status endpoint reflects completed state
        status_res = await ac.get(f"/api/v1/documents/{doc_id}/status", headers=headers)
        assert status_res.status_code == 200
        st_data = status_res.json()
        assert st_data["status"].upper() == "READY"
        assert st_data["progress_percentage"] == 100
        assert "جاهز" in st_data["progress_stage"]

@pytest.mark.asyncio
async def test_get_document_status_endpoint_and_idor():
    """
    Asserts requirement:
    Real-time status tracking endpoint with IDOR prevention.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "user_alpha@example.com", "المستخدم ألف")
        token_b = await get_or_create_user(ac, "user_beta@example.com", "المستخدم باء")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers_a,
            data={"title": "مستند المالك ألف", "subject": "الفيزياء"},
            files={"file": ("doc_owner_a.pdf", pdf_bytes, "application/pdf")}
        )
        doc_id = upload_res.json()["id"]

        # User A can get status
        res_a = await ac.get(f"/api/v1/documents/{doc_id}/status", headers=headers_a)
        assert res_a.status_code == 200
        assert res_a.json()["id"] == doc_id

        # User B cannot get status (IDOR protection)
        res_b = await ac.get(f"/api/v1/documents/{doc_id}/status", headers=headers_b)
        assert res_b.status_code == 403
        assert "صلاحية" in res_b.json()["detail"]

        await document_worker.wait_for_document(doc_id, timeout=10.0)

@pytest.mark.asyncio
async def test_retry_failed_document_and_idor():
    """
    Asserts requirement:
    Ability to retry failed documents, increment retry_count, and IDOR protection.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_owner = await get_or_create_user(ac, "retry_owner@example.com", "مالك الإعادة")
        token_other = await get_or_create_user(ac, "retry_attacker@example.com", "مهاجم الإعادة")
        headers_owner = {"Authorization": f"Bearer {token_owner}"}
        headers_other = {"Authorization": f"Bearer {token_other}"}

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers_owner,
            data={"title": "مستند للاختبار الفاشل", "subject": "الفيزياء"},
            files={"file": ("doc_retry_test.pdf", pdf_bytes, "application/pdf")}
        )
        doc_id = upload_res.json()["id"]
        await document_worker.wait_for_document(doc_id, timeout=10.0)

        # 1. Attempting retry on READY document fails
        retry_ready = await ac.post(f"/api/v1/documents/{doc_id}/retry", headers=headers_owner)
        assert retry_ready.status_code == 400
        assert "مكتمل" in retry_ready.json()["detail"]

        # 2. Simulate failure in database
        async with AsyncSessionLocal() as db:
            doc = await db.get(Document, doc_id)
            doc.status = "FAILED"
            doc.error_message = "خطأ محاكاة تجريبي"
            await db.commit()

        # 3. User Other tries to retry (IDOR check)
        idor_retry = await ac.post(f"/api/v1/documents/{doc_id}/retry", headers=headers_other)
        assert idor_retry.status_code == 403

        # 4. Owner retries successfully
        owner_retry = await ac.post(f"/api/v1/documents/{doc_id}/retry", headers=headers_owner)
        assert owner_retry.status_code == 200
        retry_data = owner_retry.json()
        assert retry_data["status"].upper() == "PENDING"
        assert retry_data["retry_count"] == 1

        # 5. Background worker re-processes it back to READY
        final_status = await document_worker.wait_for_document(doc_id, timeout=10.0)
        assert (final_status or "").upper() == "READY"

@pytest.mark.asyncio
async def test_idempotency_prevents_duplicate_processing():
    """
    Asserts requirement:
    Prevent running duplicate background jobs for the same document at the same time.
    """
    doc_id = 999999
    # Simulate doc_id is currently active
    document_worker._active_jobs.add(doc_id)
    try:
        # Enqueue should safely skip / return False
        result = await document_worker.enqueue_document(doc_id)
        assert result is False
    finally:
        document_worker._active_jobs.discard(doc_id)

@pytest.mark.asyncio
async def test_server_restart_recovery():
    """
    Asserts requirement:
    Server restart recovery: interrupted documents in PENDING, PROCESSING, INDEXING
    are detected on startup and resumed without data loss.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "recovery_user@example.com", "طالب الاسترداد")
        headers = {"Authorization": f"Bearer {token}"}

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers,
            data={"title": "مستند استرداد بعد إعادة التشغيل", "subject": "الفيزياء"},
            files={"file": ("doc_recovery.pdf", pdf_bytes, "application/pdf")}
        )
        doc_id = upload_res.json()["id"]

        # Wait for initial upload to settle
        await document_worker.wait_for_document(doc_id, timeout=10.0)

        # Simulate server crash mid-processing
        async with AsyncSessionLocal() as db:
            doc = await db.get(Document, doc_id)
            doc.status = "PROCESSING"
            doc.progress_stage = "انقطع الاتصال أثناء المعالجة"
            await db.commit()

        # Trigger restart recovery logic
        await document_worker.recover_interrupted_jobs()

        # Worker should pick it up and process to READY
        final_status = await document_worker.wait_for_document(doc_id, timeout=10.0)
        assert (final_status or "").upper() == "READY"
