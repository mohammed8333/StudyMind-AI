import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_full_pipeline_study_cycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login user
        login_res = await ac.post(
            "/api/v1/auth/login",
            data={"username": "ahmed_student@example.com", "password": "pass1234Secure!"}
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload sample physics book
        sample_pdf_path = os.path.join(os.path.dirname(__file__), "..", "sample_physics_book.pdf")
        assert os.path.exists(sample_pdf_path), "Sample PDF should exist"

        with open(sample_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        upload_res = await ac.post(
            "/api/v1/documents/upload",
            headers=headers,
            data={"title": "كتاب فيزياء الحركة المتسارعة", "subject": "الفيزياء"},
            files={"file": ("physics_test.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201
        doc_data = upload_res.json()
        doc_id = doc_data["id"]
        assert doc_data["status"] == "indexed"
        assert doc_data["total_pages"] == 3

        # 3. Retrieve chunks with page tracking
        chunks_res = await ac.get(f"/api/v1/documents/{doc_id}/chunks", headers=headers)
        assert chunks_res.status_code == 200
        chunks = chunks_res.json()
        assert len(chunks) >= 3
        # Check page numbers
        pages_found = {c["page_number"] for c in chunks}
        assert 1 in pages_found
        assert 2 in pages_found
        assert 3 in pages_found

        # 4. Ask AI Tutor with page citation
        ask_res = await ac.post(
            "/api/v1/tutor/ask",
            headers=headers,
            json={
                "document_id": doc_id,
                "question": "اشرحلي قانون نيوتن الثاني وما هي علاقته بكتلة الجسم وعجلته؟",
                "explanation_level": "very_simple",
                "target_page": 2
            }
        )
        assert ask_res.status_code == 200
        tutor_data = ask_res.json()
        assert "answer" in tutor_data
        assert len(tutor_data["sources"]) > 0
        # Check source page citations
        assert any(s["page_number"] == 2 for s in tutor_data["sources"])

        # 5. Generate Quiz
        quiz_res = await ac.post(
            "/api/v1/quizzes/generate",
            headers=headers,
            json={
                "document_id": doc_id,
                "difficulty": "medium",
                "num_questions": 3,
                "question_type": "mcq"
            }
        )
        assert quiz_res.status_code == 201
        quiz_data = quiz_res.json()
        quiz_id = quiz_data["id"]
        assert len(quiz_data["questions"]) > 0

        # 6. Submit Quiz answers
        q1 = quiz_data["questions"][0]
        sub_res = await ac.post(
            f"/api/v1/quizzes/{quiz_id}/submit",
            headers=headers,
            json={
                "time_taken_seconds": 45,
                "answers": [
                    {"question_id": q1["id"], "selected_answer": q1["options"][0]}
                ]
            }
        )
        assert sub_res.status_code == 200
        result_data = sub_res.json()
        assert "score" in result_data
        assert "percentage" in result_data
        assert len(result_data["questions_feedback"]) > 0

        # 7. Verify Adaptive Analytics & Mastery Update
        dash_res = await ac.get("/api/v1/analytics/dashboard", headers=headers)
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        assert dash_data["total_documents"] >= 1
        assert dash_data["total_quizzes_taken"] >= 1
        assert len(dash_data["recommended_revision_plan"]) > 0
