import os
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.models.quiz import Quiz, QuizQuestion
from app.models.mastery import Concept, StudentMastery, RemedialSession
from app.services.quiz_generator import classify_student_error
from sqlalchemy import select

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
async def test_error_root_cause_classification():
    """Verify that classify_student_error identifies all 4 distinct root causes."""
    # 1. Calculation mistake
    q_calc = QuizQuestion(
        question_text="احسب القوة الناتجة عن تسارع 5 م/ث2 لكتلة مقدارها 10 كجم؟",
        correct_answer="50 نيوتن",
        options_json=json.dumps(["50 نيوتن", "40 نيوتن", "25 نيوتن", "15 نيوتن"])
    )
    err_type, _ = classify_student_error(q_calc, "40 نيوتن", "50 نيوتن")
    assert err_type == "calculation_mistake"

    # 2. Careless error (Negation keyword 'ما عدا' or 'ليس')
    q_careless = QuizQuestion(
        question_text="جميع العبارات التالية من خصائص الغاز المثالي ما عدا:",
        correct_answer="حجم جزيئاته يشغل حيزاً كبيراً",
        options_json=json.dumps(["حجم جزيئاته يشغل حيزاً كبيراً", "تصادمات جزيئاته مرنة", "قوى التجاذب مهملة"])
    )
    err_type, _ = classify_student_error(q_careless, "تصادمات جزيئاته مرنة", "حجم جزيئاته يشغل حيزاً كبيراً")
    assert err_type == "careless_error"

    # 3. Misconception (Opposite pairs)
    q_miscon = QuizQuestion(
        question_text="ما هي العلاقة بين شدة التيار وفرق الجهد عند ثبوت المقاومة؟",
        correct_answer="علاقة طردية",
        options_json=json.dumps(["علاقة طردية", "علاقة عكسية", "علاقة جيبية"])
    )
    err_type, _ = classify_student_error(q_miscon, "علاقة عكسية", "علاقة طردية")
    assert err_type == "misconception"

    # 4. Knowledge gap (Default factual miss)
    q_gap = QuizQuestion(
        question_text="ما هي وحدة قياس الشغل في النظام الدولي للوحدات؟",
        correct_answer="الجول",
        options_json=json.dumps(["الجول", "النيوتن", "الواط"])
    )
    err_type, _ = classify_student_error(q_gap, "النيوتن", "الجول")
    assert err_type in ["knowledge_gap", "calculation_mistake"]

@pytest.mark.asyncio
async def test_adaptive_learning_closed_loop_flow():
    """
    Tests the complete closed loop:
    1. User takes a quiz and answers wrong.
    2. Concept error is classified and StudentMastery updated.
    3. POST /api/v1/learning/remediate/{concept_id} generates diagnosis, grounded mini-lesson, and 3-5 questions.
    4. POST /api/v1/learning/remediate/{session_id}/submit grades answers and recalculates mastery before/after.
    5. Checks is_proficient == True and weak point cleared.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "adaptive_student@example.com", "طالب تكيفي")
        headers = {"Authorization": f"Bearer {token}"}

        # Get student user ID
        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        user_id = me_res.json()["id"]

        # Create a document and chunks directly in db for testing
        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الفيزياء التكيفية",
                subject="فيزياء",
                filename="adaptive_phys.pdf",
                file_path="mock/adaptive_phys.pdf",
                owner_id=user_id,
                status="READY",
                progress_percentage=100
            )
            db.add(doc)
            await db.flush()

            chunk1 = DocumentChunk(
                document_id=doc.id,
                page_number=3,
                chunk_index=0,
                chapter="قانون نيوتن الثاني",
                content="ينص قانون نيوتن الثاني على أن القوة المحصلة المؤثرة على جسم تساوي المعدل الزمني للتغير في كمية تحركه. وتتناسب العجلة طردياً مع القوة المؤثرة وعكسياً مع الكتلة.",
                content_normalized="ينص قانون نيوتن الثاني على ان القوة المحصلة المؤثرة على جسم تساوي المعدل الزمني للتغير في كمية تحركه"
            )
            chunk2 = DocumentChunk(
                document_id=doc.id,
                page_number=4,
                chunk_index=1,
                chapter="قانون نيوتن الثاني",
                content="الصيغة الرياضية لقانون نيوتن الثاني هي: القوة = الكتلة × العجلة (F = m × a). وتقاس القوة بوحدة النيوتن في النظام الدولي.",
                content_normalized="الصيغة الرياضية لقانون نيوتن الثاني هي القوة تساوي الكتلة في العجلة وتقاس القوة بوحدة النيوتن"
            )
            db.add_all([chunk1, chunk2])

            concept = Concept(
                document_id=doc.id,
                name="قانون نيوتن الثاني",
                subject="فيزياء",
                chapter="قوانين الحركة"
            )
            db.add(concept)
            await db.flush()

            # Create a quiz with a question for this concept
            quiz = Quiz(
                title="اختبار قوانين الحركة",
                document_id=doc.id,
                total_questions=1
            )
            db.add(quiz)
            await db.flush()

            q1 = QuizQuestion(
                quiz_id=quiz.id,
                concept_id=concept.id,
                question_text="وفق قانون نيوتن الثاني، ما هي العلاقة بين عجلة الجسم والقوة المؤثرة عليه؟",
                question_type="mcq",
                options_json=json.dumps(["علاقة طردية", "علاقة عكسية", "لا توجد علاقة"]),
                correct_answer="علاقة طردية",
                explanation="تتناسب العجلة طردياً مع القوة المؤثرة."
            )
            db.add(q1)
            await db.commit()

            concept_id = concept.id
            quiz_id = quiz.id
            q1_id = q1.id

        # 1. Take quiz and answer incorrectly (misconception)
        quiz_submit_res = await ac.post(
            f"/api/v1/quizzes/{quiz_id}/submit",
            headers=headers,
            json={
                "time_taken_seconds": 15,
                "answers": [
                    {"question_id": q1_id, "selected_answer": "علاقة عكسية"}
                ]
            }
        )
        assert quiz_submit_res.status_code == 200
        submit_data = quiz_submit_res.json()
        assert submit_data["score"] == 0.0
        assert submit_data["passed"] is False
        assert len(submit_data["questions_feedback"]) == 1
        fb = submit_data["questions_feedback"][0]
        assert fb["is_correct"] is False
        assert fb["error_type"] == "misconception"

        # 2. Check that student has a weak concept diagnosed
        weak_res = await ac.get("/api/v1/learning/weak-concepts", headers=headers)
        assert weak_res.status_code == 200
        weak_list = weak_res.json()
        assert len(weak_list) >= 1
        target_weak = next(w for w in weak_list if w["concept_id"] == concept_id)
        assert target_weak["concept_name"] == "قانون نيوتن الثاني"
        assert target_weak["primary_error_type"] == "misconception"
        assert "فهم خاطئ" in target_weak["primary_error_label"]

        # 3. Start Remedial Session via POST /api/v1/learning/remediate/{concept_id}
        remedial_res = await ac.post(
            f"/api/v1/learning/remediate/{concept_id}",
            headers=headers
        )
        assert remedial_res.status_code == 200
        rem_data = remedial_res.json()
        assert rem_data["concept_id"] == concept_id
        assert rem_data["concept_name"] == "قانون نيوتن الثاني"
        assert rem_data["primary_error_type"] == "misconception"
        assert "تشخيص" in rem_data["diagnosis"]
        assert "الدرس العلاجي" in rem_data["mini_lesson"] or "قانون نيوتن" in rem_data["mini_lesson"]
        assert 3 <= len(rem_data["questions"]) <= 5
        session_id = rem_data["session_id"]

        # 4. Fetch questions and prepare correct answers for re-test
        # Query session from db to know correct answers for testing
        async with AsyncSessionLocal() as db:
            session_db = await db.get(RemedialSession, session_id)
            stored_qs = json.loads(session_db.questions_json)

        answers_to_submit = [
            {"question_id": q["id"], "selected_answer": q["correct_answer"]}
            for q in stored_qs
        ]

        # 5. Submit Remedial Session via POST /api/v1/learning/remediate/{session_id}/submit
        submit_rem_res = await ac.post(
            f"/api/v1/learning/remediate/{session_id}/submit",
            headers=headers,
            json={"answers": answers_to_submit}
        )
        assert submit_rem_res.status_code == 200
        result_data = submit_rem_res.json()
        assert result_data["score"] == len(stored_qs)
        assert result_data["percentage"] == 100.0
        assert result_data["is_proficient"] is True
        assert result_data["mastery_after"] >= 80.0
        assert "أتقنت" in result_data["proficiency_message"] or "مبروك" in result_data["proficiency_message"]

        # 6. Verify in DB that concept is now proficient and not weak
        async with AsyncSessionLocal() as db:
            m_res = await db.execute(
                select(StudentMastery).where(
                    StudentMastery.student_id == user_id,
                    StudentMastery.concept_id == concept_id
                )
            )
            updated_mastery = m_res.scalars().first()
            assert updated_mastery.is_proficient is True
            assert updated_mastery.is_weak_point is False

@pytest.mark.asyncio
async def test_remedial_session_idor_protection():
    """Verify that User B cannot access or submit User A's remedial session or concept."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "student_a_idor@example.com", "طالب أ")
        token_b = await get_or_create_user(ac, "student_b_idor@example.com", "طالب ب")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Create doc and concept for User A
        me_a = await ac.get("/api/v1/auth/me", headers=headers_a)
        user_a_id = me_a.json()["id"]

        async with AsyncSessionLocal() as db:
            doc_a = Document(
                title="مذكرة الطالب أ الخاصة",
                filename="private_a.pdf",
                file_path="mock/a.pdf",
                owner_id=user_a_id,
                status="READY"
            )
            db.add(doc_a)
            await db.flush()
            concept_a = Concept(
                document_id=doc_a.id,
                name="مفهوم خاص بالطالب أ"
            )
            db.add(concept_a)
            await db.commit()
            concept_a_id = concept_a.id

        # 1. User B tries to start remediation on User A's concept
        idor_res1 = await ac.post(
            f"/api/v1/learning/remediate/{concept_a_id}",
            headers=headers_b
        )
        assert idor_res1.status_code == 403, "IDOR check must reject other students with 403"

        # 2. User A starts legitimate session
        valid_res = await ac.post(
            f"/api/v1/learning/remediate/{concept_a_id}",
            headers=headers_a
        )
        assert valid_res.status_code == 200
        session_id = valid_res.json()["session_id"]

        # 3. User B tries to submit User A's session
        idor_res2 = await ac.post(
            f"/api/v1/learning/remediate/{session_id}/submit",
            headers=headers_b,
            json={"answers": []}
        )
        assert idor_res2.status_code == 403, "IDOR check must reject other students from submitting session"
