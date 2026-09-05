import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()

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

@pytest.mark.asyncio
async def test_document_rename_and_idor():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "user_a_rename@example.com", "مستخدم أ")
        token_b = await get_or_create_user(ac, "user_b_rename@example.com", "مستخدم ب")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 1. User A uploads a document
        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers_a,
            data={"title": "مذكرة فيزياء أصلية", "subject": "الفيزياء"},
            files={"file": ("doc_a.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        doc_id = upload_res.json()["id"]

        # 2. User B tries to rename User A's document (IDOR Attack)
        idor_patch = await ac.patch(
            f"/api/v1/documents/{doc_id}",
            headers=headers_b,
            json={"title": "مذكرة مسروقة ومعدلة", "subject": "مادة أخرى"}
        )
        assert idor_patch.status_code == 403, "IDOR check must reject other users with 403 Forbidden"
        assert "صلاحية" in idor_patch.json()["detail"]

        # Verify title remains unchanged
        get_res = await ac.get(f"/api/v1/documents/{doc_id}", headers=headers_a)
        assert get_res.json()["title"] == "مذكرة فيزياء أصلية"

        # 3. User A renames own document successfully
        valid_patch = await ac.patch(
            f"/api/v1/documents/{doc_id}",
            headers=headers_a,
            json={"title": "مذكرة الفيزياء بعد التعديل", "subject": "الكيمياء"}
        )
        assert valid_patch.status_code == 200
        patched_data = valid_patch.json()
        assert patched_data["title"] == "مذكرة الفيزياء بعد التعديل"
        assert patched_data["subject"] == "الكيمياء"

        # 4. Empty title validation fails
        invalid_patch = await ac.patch(
            f"/api/v1/documents/{doc_id}",
            headers=headers_a,
            json={"title": "   "}
        )
        assert invalid_patch.status_code == 422, "Empty/whitespace title should be rejected"

@pytest.mark.asyncio
async def test_document_delete_and_idor():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "user_a_delete@example.com", "طالب أ")
        token_b = await get_or_create_user(ac, "user_b_delete@example.com", "طالب ب")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 1. User A uploads a document
        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers_a,
            data={"title": "مذكرة للحذف", "subject": "الرياضيات"},
            files={"file": ("doc_del.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        doc_id = upload_res.json()["id"]

        # Verify document and chunks exist
        chunks_res = await ac.get(f"/api/v1/documents/{doc_id}/chunks", headers=headers_a)
        assert chunks_res.status_code == 200
        assert len(chunks_res.json()) > 0

        # 2. User B tries to delete User A's document (IDOR Attack)
        idor_del = await ac.delete(f"/api/v1/documents/{doc_id}", headers=headers_b)
        assert idor_del.status_code == 403, "User B should not be able to delete User A's document"

        # Verify document still exists
        check_res = await ac.get(f"/api/v1/documents/{doc_id}", headers=headers_a)
        assert check_res.status_code == 200

        # 3. User A deletes their own document
        del_res = await ac.delete(f"/api/v1/documents/{doc_id}", headers=headers_a)
        assert del_res.status_code == 200
        assert del_res.json()["document_id"] == doc_id

        # 4. Verify document is gone from DB
        check_res_after = await ac.get(f"/api/v1/documents/{doc_id}", headers=headers_a)
        assert check_res_after.status_code == 404

        # 5. Verify chunks are also deleted
        chunks_after = await ac.get(f"/api/v1/documents/{doc_id}/chunks", headers=headers_a)
        assert chunks_after.status_code == 404

@pytest.mark.asyncio
async def test_delete_missing_file_gracefully():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "user_missing_file@example.com", "مستخدم ملف")
        headers = {"Authorization": f"Bearer {token}"}

        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers,
            data={"title": "مذكرة سيحذف ملفها الفيزيائي", "subject": "الفيزياء"},
            files={"file": ("doc_orphan.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        doc_id = upload_res.json()["id"]

        # Delete the physical file directly from filesystem before API delete
        doc_info = await ac.get(f"/api/v1/documents/{doc_id}", headers=headers)
        file_path = doc_info.json().get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)

        # Calling DELETE API on document with missing physical file should not crash
        del_res = await ac.delete(f"/api/v1/documents/{doc_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["document_id"] == doc_id

@pytest.mark.asyncio
async def test_non_existent_document():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "user_nonexist@example.com", "مستخدم جديد")
        headers = {"Authorization": f"Bearer {token}"}

        del_res = await ac.delete("/api/v1/documents/999999", headers=headers)
        assert del_res.status_code == 404

        patch_res = await ac.patch(
            "/api/v1/documents/999999",
            headers=headers,
            json={"title": "اسم جديد"}
        )
        assert patch_res.status_code == 404
