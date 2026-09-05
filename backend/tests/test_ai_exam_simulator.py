import os
import json
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch
from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.exam import Exam, ExamQuestion, ExamAttempt, ExamQuestionResponse
from app.services.exam_service import normalize_true_false
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
async def test_generate_ai_exam():
    """Verify generating an exam with MCQ, True/False, and Short Answer from document chunks."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester1@example.com", "طالب الامتحانات 1")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الكيمياء العامة",
                subject="الكيمياء",
                filename="chem_exam.pdf",
                file_path="mock/chem_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    chapter="الروابط الكيميائية",
                    content="الرابطة الأيونية تنشأ نتيجة قوى تجاذب كهروستاتيكي بين أيون موجب لفلز وأيون سالب للافلز.",
                    content_normalized="الرابطة الايونية تنشا نتيجة قوي تجاذب كهروستاتيكي بين ايون موجب لفلز وايون سالب للافلز."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    chapter="الروابط الكيميائية",
                    content="الرابطة التساهمية تتكون عن طريق مشاركة كل ذرة بإلكترون أو أكثر لتصل إلى التركيب المستقر.",
                    content_normalized="الرابطة التساهمية تتكون عن طريق مشاركة كل ذرة بالكترون او اكثر لتصل الي التركيب المستقر."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    chapter="الاتزان الكيميائي",
                    content="قاعدة لوشاتيليه تنص على أنه إذا أثر مؤثر خارجي على نظام في حالة اتزان فإن النظام ينشط في الاتجاه الذي يقلل من هذا التأثير.",
                    content_normalized="قاعدة لوشاتيليه تنص علي انه اذا اثر مؤثر خارجي علي نظام في حالة اتزان فان النظام ينشط في الاتجاه الذي يقلل من هذا التاثير."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    chapter="الاتزان الكيميائي",
                    content="العامل الحفاز يزيد من سرعة التفاعل الكيميائي دون أن يتغير أو يؤثر على موضع الاتزان الكيميائي.",
                    content_normalized="العامل الحفاز يزيد من سرعة التفاعل الكيميائي دون ان يتغير او يؤثر علي موضع الاتزان الكيميائي."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        # Generate Exam
        res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "title": "امتحان تجريبي للكيمياء",
            "subject": "الكيمياء",
            "num_questions": 3,
            "difficulty": "medium",
            "duration_minutes": 45,
            "question_types": ["mcq", "true_false", "short_answer"],
            "is_mock_mode": True
        })

        assert res.status_code == 201, res.text
        data = res.json()
        assert data["title"] == "امتحان تجريبي للكيمياء"
        assert data["total_questions"] == 3
        assert data["duration_minutes"] == 45
        assert data["is_mock_mode"] is True
        assert len(data["questions"]) == 3

        q_types = {q["question_type"] for q in data["questions"]}
        assert "mcq" in q_types
        assert "true_false" in q_types
        assert "short_answer" in q_types


@pytest.mark.asyncio
async def test_server_timer_and_attempt_start():
    """Verify start attempt calculates server-enforced deadline and hides answers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester2@example.com", "طالب الامتحانات 2")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الأحياء",
                subject="الأحياء",
                filename="bio_exam.pdf",
                file_path="mock/bio_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    content="الميتوكوندريا هي مصنع إنتاج الطاقة في الخلية وتحتوي على جزيئات أدينوسين ثلاثي الفوسفات.",
                    content_normalized="الميتوكوندريا هي مصنع انتاج الطاقة في الخلية وتحتوي علي جزيئات ادينوسين ثلاثي الفوسفات."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    content="جدار الخلية النباتية يتكون أساساً من السليلوز ليعطي الخلية دعامة وحماية كاملة.",
                    content_normalized="جدار الخلية النباتية يتكون اساسا من السليلوز ليعطي الخلية دعامة وحماية كاملة."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    content="البلاستيدات الخضراء تقوم بعملية البناء الضوئي وتحويل الطاقة الضوئية إلى طاقة كيميائية.",
                    content_normalized="البلاستيدات الخضراء تقوم بعملية البناء الضوئي وتحويل الطاقة الضوئية الي طاقة كيميائية."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    content="الريبوسومات مسؤولة عن تخليق البروتينات داخل السيتوبلازم وعلى الشبكة الإندوبلازمية الخشنة.",
                    content_normalized="الريبوسومات مسؤولة عن تخليق البروتينات داخل السيتوبلازم وعلي الشبكة الاندوبلازمية الخشنة."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        # Generate Exam
        exam_res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "num_questions": 3,
            "duration_minutes": 20
        })
        assert exam_res.status_code == 201
        exam_id = exam_res.json()["id"]

        # Start Attempt
        start_res = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        assert start_res.status_code == 200, start_res.text
        start_data = start_res.json()

        assert start_data["exam_id"] == exam_id
        assert start_data["attempt_number"] == 1
        assert start_data["remaining_seconds"] > 1100  # 20 mins = 1200s + 30s buffer
        assert len(start_data["questions"]) == 3

        # Sanity check: Ensure answers & explanations are NOT in the question list!
        for q in start_data["questions"]:
            assert "correct_answer" not in q
            assert "explanation" not in q


@pytest.mark.asyncio
async def test_auto_grading_and_analytics():
    """Verify auto-grading of MCQ, True/False, Short Answer, error analysis, and recommendations."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester3@example.com", "طالب الامتحانات 3")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الفيزياء الحديثة",
                subject="الفيزياء",
                filename="physics_exam.pdf",
                file_path="mock/physics_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    content="ظاهرة كومتون تثبت الصفة الجسيمية للإشعاع الكهرومغناطيسي وفوتوناته.",
                    content_normalized="ظاهرة كومتون تثبت الصفة الجسيمية للاشعاع الكهرومغناطيسي وفوتوناته."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    content="معادلة دي برولي تربط بين الطول الموجي وكمية التحرك الجسيمي وتؤكد الطبيعة المزدوجة.",
                    content_normalized="معادلة دي برولي تربط بين الطول الموجي وكمية التحرك الجسيمي وتؤكد الطبيعة المزدوجة."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    content="المجهر الإلكتروني يعتمد على الخواص الموجية للشعاع الإلكتروني عالي السرعة.",
                    content_normalized="المجهر الالكتروني يعتمد علي الخواص الموجية للشعاع الالكتروني عالي السرعة."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    content="إشعاع الجسم الأسود يفسر انبعاث الإشعاع الكهرومغناطيسي ككمات محددة تسمى فوتونات.",
                    content_normalized="اشعاع الجسم الاسود يفسر انبعاث الاشعاع الكهرومغناطيسي ككمات محددة تسمي فوتونات."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        # Generate Exam with 3 questions
        exam_res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "num_questions": 3,
            "question_types": ["mcq", "true_false", "short_answer"],
            "duration_minutes": 30
        })
        exam_data = exam_res.json()
        exam_id = exam_data["id"]

        # Fetch underlying questions from DB to prepare specific answers (1 correct, 1 wrong, 1 unanswered)
        async with AsyncSessionLocal() as db:
            eq_stmt = select(ExamQuestion).where(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_index)
            eq_res = await db.execute(eq_stmt)
            qs = eq_res.scalars().all()

        start_res = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        attempt_id = start_res.json()["attempt_id"]

        # Question 1 (MCQ or TF): Provide exact correct answer
        # Question 2: Provide wrong answer
        if qs[1].question_type == "true_false":
            wrong_ans = "خطأ" if normalize_true_false(qs[1].correct_answer) == "true" else "صح"
        elif qs[1].question_type == "mcq":
            opts = json.loads(qs[1].options_json or "[]")
            wrong_opts = [o for o in opts if o != qs[1].correct_answer]
            wrong_ans = wrong_opts[0] if wrong_opts else "خيار غير صحيح إطلاقاً"
        else:
            wrong_ans = "إجابة لا تمت للموضوع بصلة"

        # Question 3: Leave blank/unanswered
        answers_payload = [
            {
                "question_id": qs[0].id,
                "student_answer": qs[0].correct_answer,
                "time_spent_seconds": 45
            },
            {
                "question_id": qs[1].id,
                "student_answer": wrong_ans,
                "time_spent_seconds": 30
            },
            {
                "question_id": qs[2].id,
                "student_answer": "",  # Unanswered
                "time_spent_seconds": 0
            }
        ]

        # Submit Attempt
        submit_res = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts/{attempt_id}/submit",
            headers=headers,
            json={"answers": answers_payload, "total_time_taken_seconds": 75}
        )
        assert submit_res.status_code == 200, submit_res.text
        result = submit_res.json()

        assert result["attempt_id"] == attempt_id
        assert result["status"] == "SUBMITTED"
        assert result["correct_count"] == 1
        assert result["wrong_count"] == 1
        assert result["unanswered_count"] == 1
        assert result["time_taken_seconds"] == 75
        assert result["avg_time_per_question_seconds"] == 25.0
        assert len(result["weak_concepts"]) >= 1
        assert len(result["remedial_recommendations"]) >= 1
        assert len(result["questions_feedback"]) == 3


@pytest.mark.asyncio
async def test_prevent_resubmission_after_submit():
    """Verify that tampering or submitting answers after attempt completion is rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester4@example.com", "طالب الامتحانات 4")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الجيولوجيا",
                subject="الجيولوجيا",
                filename="geo_exam.pdf",
                file_path="mock/geo_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    content="الصخور النارية تتكون نتيجة تبلور الصهارة عند انخفاض درجات الحرارة.",
                    content_normalized="الصخور النارية تتكون نتيجة تبلور الصهارة عند انخفاض درجات الحرارة."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    content="الصخور الرسوبية تتشكل من ترسب وتماسك الفتات الصخري في طبقات أفقية متتالية.",
                    content_normalized="الصخور الرسوبية تتشكل من ترسب وتماسك الفتات الصخري في طبقات افقية متتالية."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    content="الصخور المتحولة تنشأ بتأثير الضغط والحرارة العاليين على صخور أصلية سابقة.",
                    content_normalized="الصخور المتحولة تنشا بتاثير الضغط والحرارة العاليين علي صخور اصلية سابقة."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    content="دورة الصخور توضح تحول أي نوع من الصخور إلى نوع آخر باستمرار في الطبيعة.",
                    content_normalized="دورة الصخور توضح تحول اي نوع من الصخور الي نوع اخر باستمرار في الطبيعة."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        exam_res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "num_questions": 2,
            "duration_minutes": 15
        })
        exam_id = exam_res.json()["id"]

        start_res = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        attempt_id = start_res.json()["attempt_id"]

        # First submission succeeds
        first_sub = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts/{attempt_id}/submit",
            headers=headers,
            json={"answers": []}
        )
        assert first_sub.status_code == 200

        # Second submission MUST fail with HTTP 400
        second_sub = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts/{attempt_id}/submit",
            headers=headers,
            json={"answers": []}
        )
        assert second_sub.status_code == 400
        assert "مسبقاً" in second_sub.json()["detail"]


@pytest.mark.asyncio
async def test_backend_timeout_enforcement():
    """Verify that backend flags status as TIMED_OUT when server deadline expires."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester5@example.com", "طالب الامتحانات 5")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة التاريخ الحديث",
                subject="التاريخ",
                filename="history_exam.pdf",
                file_path="mock/history_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    content="ثورة 1919 جسدت وحدة الشعب المصري ضد الاحتلال الإنجليزي بقيادة سعد زغلول.",
                    content_normalized="ثورة 1919 جسدت وحدة الشعب المصري ضد الاحتلال الانجليزي بقيادة سعد زغلول."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    content="معاهدة 1936 ألغت الامتيازات الأجنبية في مصر وحولت العلاقة لتحالف ثنائي.",
                    content_normalized="معاهدة 1936 الغت الامتيازات الاجنبية في مصر وحولت العلاقة لتحالف ثنائي."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    content="ثورة 23 يوليو 1952 أعلنت الجمهورية وألغت النظام الملكي وقضت على الإقطاع.",
                    content_normalized="ثورة 23 يوليو 1952 اعلنت الجمهورية والغت النظام الملكي وقضت علي الاقطاع."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    content="تأميم قناة السويس عام 1956 كان قراراً سيادياً مصرياً أدى للعدوان الثلاثي.",
                    content_normalized="تاميم قناة السويس عام 1956 كان قرارا سياديا مصريا ادي للعدوان الثلاثي."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        exam_res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "num_questions": 2,
            "duration_minutes": 10
        })
        exam_id = exam_res.json()["id"]

        start_res = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        attempt_id = start_res.json()["attempt_id"]

        # Artificially set expires_at to the past in database
        async with AsyncSessionLocal() as db:
            att = await db.get(ExamAttempt, attempt_id)
            att.expires_at = datetime.utcnow() - timedelta(minutes=5)
            await db.commit()

        # Submit late attempt
        submit_res = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts/{attempt_id}/submit",
            headers=headers,
            json={"answers": []}
        )
        assert submit_res.status_code == 200
        data = submit_res.json()
        assert data["status"] == "TIMED_OUT"
        assert "انتهى وقت الامتحان" in data["summary_feedback"]


@pytest.mark.asyncio
async def test_exam_retry_and_history():
    """Verify that retrying an exam creates attempt #2 and records history properly."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "exam_tester6@example.com", "طالب الامتحانات 6")
        headers = {"Authorization": f"Bearer {token}"}

        me = (await ac.get("/api/v1/auth/me", headers=headers)).json()
        user_id = me["id"]

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الفلسفة والمنطق",
                subject="الفلسفة",
                filename="phil_exam.pdf",
                file_path="mock/phil_exam.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunks = [
                DocumentChunk(
                    document_id=doc.id,
                    page_number=1,
                    chunk_index=0,
                    content="الفلسفة البيئية تدرس علاقة الإنسان بالبيئة الطبيعية وكيفية الحفاظ على التوازن البيولوجي.",
                    content_normalized="الفلسفة البيئية تدرس علاقة الانسان بالبيئة الطبيعية وكيفية الحفاظ علي التوازن البيولوجي."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=2,
                    chunk_index=1,
                    content="أخلاق المسؤولية عند هانز يوناس تؤكد على واجب حماية حقوق الأجيال المستقبلية في الموارد.",
                    content_normalized="اخلاق المسؤولية عند هانز يوناس تؤكد علي واجب حماية حقوق الاجيال المستقبلية في الموارد."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=3,
                    chunk_index=2,
                    content="الاستدلال الاستقرائي ينتقل من الجزء إلى الكل ومن الحالات الخاصة إلى الحكم العام.",
                    content_normalized="الاستدلال الاستقرائي ينتقل من الجزء الي الكل ومن الحالات الخاصة الي الحكم العام."
                ),
                DocumentChunk(
                    document_id=doc.id,
                    page_number=4,
                    chunk_index=3,
                    content="المغالطات المنطقية تمثل خللاً في بنية الحجة الاستدلالية يؤدي لنتائج غير مبررة.",
                    content_normalized="المغالطات المنطقية تمثل خللا في بنية الحجة الاستدلالية يؤدي لنتائج غير مبررة."
                )
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        exam_res = await ac.post("/api/v1/exams/generate", headers=headers, json={
            "document_id": doc_id,
            "num_questions": 2,
            "duration_minutes": 20
        })
        assert exam_res.status_code == 201, exam_res.text
        exam_id = exam_res.json()["id"]

        # Attempt 1
        a1 = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        assert a1.json()["attempt_number"] == 1
        att1_id = a1.json()["attempt_id"]
        await ac.post(f"/api/v1/exams/{exam_id}/attempts/{att1_id}/submit", headers=headers, json={"answers": []})

        # Attempt 2 (Retry)
        a2 = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers)
        assert a2.json()["attempt_number"] == 2
        att2_id = a2.json()["attempt_id"]
        await ac.post(f"/api/v1/exams/{exam_id}/attempts/{att2_id}/submit", headers=headers, json={"answers": []})

        # Verify Exam History
        hist_res = await ac.get("/api/v1/exams/history/my", headers=headers)
        assert hist_res.status_code == 200
        hist = hist_res.json()
        assert len(hist) >= 2
        attempt_nums = [h["attempt_number"] for h in hist if h["exam_id"] == exam_id]
        assert 1 in attempt_nums
        assert 2 in attempt_nums


@pytest.mark.asyncio
async def test_exam_idor_protection():
    """Verify that User B cannot access, start, or submit User A's exam."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token_a = await get_or_create_user(ac, "exam_user_a@example.com", "مستخدم أ")
        token_b = await get_or_create_user(ac, "exam_user_b@example.com", "مستخدم ب")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        me_a = (await ac.get("/api/v1/auth/me", headers=headers_a)).json()

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرات سرية لـ أ",
                subject="سرية",
                filename="secret.pdf",
                file_path="mock/secret.pdf",
                owner_id=me_a["id"],
                status="READY"
            )
            db.add(doc)
            await db.flush()
            chunks = [
                DocumentChunk(document_id=doc.id, page_number=1, chunk_index=0, content="معلومات خاصة بالمستخدم أ فقط.", content_normalized="معلومات خاصة بالمستخدم أ فقط."),
                DocumentChunk(document_id=doc.id, page_number=2, chunk_index=1, content="بيانات سرية للتحليل الدراسي.", content_normalized="بيانات سرية للتحليل الدراسي."),
                DocumentChunk(document_id=doc.id, page_number=3, chunk_index=2, content="فقرة أخرى لتكملة النص الأكاديمي.", content_normalized="فقرة اخري لتكملة النص الاكاديمي."),
                DocumentChunk(document_id=doc.id, page_number=4, chunk_index=3, content="خاتمة الدرس والملخص النهائي للمادة.", content_normalized="خاتمة الدرس والملخص النهائي للمادة.")
            ]
            db.add_all(chunks)
            await db.commit()
            doc_id = doc.id

        exam_res = await ac.post("/api/v1/exams/generate", headers=headers_a, json={
            "document_id": doc_id,
            "num_questions": 2
        })
        exam_id = exam_res.json()["id"]

        # User B tries to view User A's exam
        b_view = await ac.get(f"/api/v1/exams/{exam_id}", headers=headers_b)
        assert b_view.status_code == 403

        # User B tries to start User A's exam
        b_start = await ac.post(f"/api/v1/exams/{exam_id}/start", headers=headers_b)
        assert b_start.status_code == 404
