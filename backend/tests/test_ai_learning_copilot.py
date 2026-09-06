import os
import json
import pytest
import pytest_asyncio
from datetime import date, datetime, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.study_plan import StudyPlan, StudyPlanTask
from app.models.flashcard import Flashcard
from app.models.copilot import CopilotMessage

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
async def test_student_learning_state_aggregation():
    """Verify that the Copilot engine accurately aggregates documents, mastery, plan, countdown, and flashcards."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "copilot_state_user@example.com", "طالب كوبايلوت 1")
        headers = {"Authorization": f"Bearer {token}"}

        # Get user id
        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        user_id = me_res.json()["id"]

        today = date.today()
        exam_target = today + timedelta(days=6)

        # Populate DB with documents, concepts, weak mastery, study plan, and due flashcard
        async with AsyncSessionLocal() as db:
            from sqlalchemy import delete
            await db.execute(delete(Document).where(Document.owner_id == user_id))
            await db.execute(delete(StudentMastery).where(StudentMastery.student_id == user_id))
            await db.execute(delete(StudyPlanTask).where(StudyPlanTask.student_id == user_id))
            await db.execute(delete(StudyPlan).where(StudyPlan.student_id == user_id))
            await db.execute(delete(Flashcard).where(Flashcard.user_id == user_id))
            await db.commit()

        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الأحياء العامة",
                subject="الأحياء",
                filename="bio_copilot.pdf",
                file_path="mock/bio_copilot.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            c1 = Concept(document_id=doc.id, name="الانقسام الميوزي", subject="الأحياء", chapter="التكاثر")
            c2 = Concept(document_id=doc.id, name="الوراثة المندلية", subject="الأحياء", chapter="الوراثة")
            db.add_all([c1, c2])
            await db.flush()

            # c1 is weak (35%), c2 is strong (85%)
            m1 = StudentMastery(
                student_id=user_id,
                concept_id=c1.id,
                mastery_score=35.0,
                is_weak_point=True,
                primary_error_type="misconception",
                error_summary="التباس بين الطور البيني والطور التمهيدي"
            )
            m2 = StudentMastery(
                student_id=user_id,
                concept_id=c2.id,
                mastery_score=85.0,
                is_weak_point=False
            )
            db.add_all([m1, m2])

            # Active study plan with exam date 6 days ahead
            plan = StudyPlan(
                student_id=user_id,
                title="خطة الأحياء المكثفة",
                exam_date=exam_target,
                subjects_json=json.dumps(["الأحياء"]),
                is_active=True,
                progress_percentage=40.0
            )
            db.add(plan)
            await db.flush()

            # Task for today
            t_today = StudyPlanTask(
                plan_id=plan.id,
                student_id=user_id,
                scheduled_date=today,
                subject="الأحياء",
                concept_id=c1.id,
                concept_name=c1.name,
                activity_type="Study",
                duration_minutes=45,
                status="PENDING"
            )
            # Due flashcard
            fc = Flashcard(
                user_id=user_id,
                document_id=doc.id,
                concept_name=c1.name,
                front="ما هو الانقسام الميوزي؟",
                back="انقسام اختزالي ينتج عنه 4 خلايا أحادية المجموعة الصبغية.",
                next_review_at=datetime.utcnow() - timedelta(hours=1)
            )
            db.add_all([t_today, fc])
            await db.commit()

        # Call GET /api/v1/copilot/state
        res = await ac.get("/api/v1/copilot/state", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["total_documents"] == 1
        assert data["overall_mastery"] == 60.0  # (35 + 85) / 2
        assert len(data["weak_concepts"]) == 1
        assert data["weak_concepts"][0]["concept_name"] == "الانقسام الميوزي"
        assert data["weak_concepts"][0]["primary_error_type"] == "misconception"
        assert len(data["strong_concepts"]) == 1
        assert data["days_until_exam"] == 6
        assert data["today_tasks_count"] == 1
        assert data["today_estimated_minutes"] == 45
        assert data["due_flashcards_count"] == 1
        assert data["is_neglected"] is False


@pytest.mark.asyncio
async def test_determine_what_to_study_now_with_rationale():
    """Verify that Copilot prioritizes weak concepts, provides rationale, and generates actionable execution items."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "copilot_next_user@example.com", "طالب التوجيه")
        headers = {"Authorization": f"Bearer {token}"}

        # Query next action
        res = await ac.get("/api/v1/copilot/next-action", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert "recommendation" in data
        assert "rationale" in data["recommendation"]
        assert len(data["recommendation"]["rationale"]) > 10
        assert "action_url" in data["recommendation"]
        assert "badge_label" in data["recommendation"]
        assert data["recommendation"]["action_type"] in [
            "REMEDIATE", "STUDY", "QUIZ", "REVIEW_FLASHCARDS", "REBALANCE", "MOCK_EXAM"
        ]


@pytest.mark.asyncio
async def test_daily_briefing_generation():
    """Verify that Daily Briefing provides greeting, date, countdown, and actionable today's plan."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "copilot_briefing_user@example.com", "طالب البريفينج")
        headers = {"Authorization": f"Bearer {token}"}

        res = await ac.get("/api/v1/copilot/briefing", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert "greeting" in data
        assert "date_str" in data
        assert "day_name_arabic" in data
        assert "focus_headline" in data
        assert "today_tasks_summary" in data
        assert "primary_action" in data
        assert len(data["quick_tips"]) > 0


@pytest.mark.asyncio
async def test_neglect_detection_and_auto_rebalance():
    """Verify that Copilot detects overdue tasks and successfully rebalances them in 1-click."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "copilot_rebalance_user@example.com", "طالب إعادة الجدولة")
        headers = {"Authorization": f"Bearer {token}"}

        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        user_id = me_res.json()["id"]

        today = date.today()
        yesterday = today - timedelta(days=2)
        exam_target = today + timedelta(days=10)

        # Create active study plan with 2 overdue tasks
        async with AsyncSessionLocal() as db:
            from sqlalchemy import delete
            await db.execute(delete(StudyPlanTask).where(StudyPlanTask.student_id == user_id))
            await db.execute(delete(StudyPlan).where(StudyPlan.student_id == user_id))
            await db.commit()

        async with AsyncSessionLocal() as db:
            plan = StudyPlan(
                student_id=user_id,
                title="خطة المراجعة المتأخرة",
                exam_date=exam_target,
                is_active=True,
                available_study_time=600,
                preferred_days_json=json.dumps([0, 1, 2, 3, 4, 5, 6]),
                daily_time_limit=120,
                priority="balanced"
            )
            db.add(plan)
            await db.flush()

            t1 = StudyPlanTask(
                plan_id=plan.id,
                student_id=user_id,
                scheduled_date=yesterday,
                subject="كيمياء",
                activity_type="Study",
                duration_minutes=30,
                status="PENDING"
            )
            t2 = StudyPlanTask(
                plan_id=plan.id,
                student_id=user_id,
                scheduled_date=yesterday,
                subject="كيمياء",
                activity_type="Quiz",
                duration_minutes=20,
                status="OVERDUE"
            )
            db.add_all([t1, t2])
            await db.commit()

        # Check state: is_neglected should be True, overdue_tasks_count should be 2
        state_res = await ac.get("/api/v1/copilot/state", headers=headers)
        assert state_res.status_code == 200
        state_data = state_res.json()
        assert state_data["is_neglected"] is True
        assert state_data["overdue_tasks_count"] == 2

        # Check next action: should recommend REBALANCE
        next_res = await ac.get("/api/v1/copilot/next-action", headers=headers)
        assert next_res.status_code == 200
        next_data = next_res.json()
        assert next_data["recommendation"]["action_type"] == "REBALANCE"
        assert "إعادة توزيع" in next_data["recommendation"]["title"]

        # Trigger 1-click rebalance
        reb_res = await ac.post("/api/v1/copilot/rebalance", headers=headers)
        assert reb_res.status_code == 200
        reb_data = reb_res.json()
        assert reb_data["success"] is True
        assert reb_data["rescheduled_count"] >= 2

        # Verify state: overdue_tasks_count should now be 0, is_neglected False
        post_state = (await ac.get("/api/v1/copilot/state", headers=headers)).json()
        assert post_state["overdue_tasks_count"] == 0
        assert post_state["is_neglected"] is False


@pytest.mark.asyncio
async def test_copilot_chat_context_routing_and_history():
    """Verify that Copilot chat handles student state questions, saves messages to DB, and retrieves history."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token = await get_or_create_user(ac, "copilot_chat_user@example.com", "طالب المحادثة الذكية")
        headers = {"Authorization": f"Bearer {token}"}

        # Send state inquiry: "ماذا يجب أن أذاكر الآن وما هو وضعي الأكاديمي؟"
        chat_res = await ac.post("/api/v1/copilot/chat", headers=headers, json={
            "message": "ماذا يجب أن أذاكر الآن وما هو وضعي الأكاديمي؟"
        })
        assert chat_res.status_code == 200, chat_res.text
        chat_data = chat_res.json()

        assert "reply" in chat_data
        assert len(chat_data["reply"]) > 20
        assert "suggested_action" in chat_data
        assert len(chat_data["quick_prompts"]) > 0

        # Verify conversation history was persisted
        hist_res = await ac.get("/api/v1/copilot/chat/history", headers=headers)
        assert hist_res.status_code == 200
        history = hist_res.json()
        assert len(history) >= 2  # user message and copilot message
        assert history[-2]["role"] == "user"
        assert history[-1]["role"] == "copilot"

        # Clear history
        clear_res = await ac.delete("/api/v1/copilot/chat/clear", headers=headers)
        assert clear_res.status_code == 200

        # Verify history is now empty
        empty_hist = (await ac.get("/api/v1/copilot/chat/history", headers=headers)).json()
        assert len(empty_hist) == 0


@pytest.mark.asyncio
async def test_copilot_idor_protection():
    """Verify that User A cannot view or manipulate User B's Copilot state, history, or rebalance."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as ac:
        token_a = await get_or_create_user(ac, "copilot_user_a@example.com", "مستخدم أ")
        token_b = await get_or_create_user(ac, "copilot_user_b@example.com", "مستخدم ب")

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A chats with Copilot
        await ac.post("/api/v1/copilot/chat", headers=headers_a, json={
            "message": "سر خاص بمذاكرتي: أريد التركيز على الجبر"
        })

        # User B fetches history -> must NOT see User A's message
        hist_b = (await ac.get("/api/v1/copilot/chat/history", headers=headers_b)).json()
        assert len(hist_b) == 0

        # User B calls clear -> User A's history must remain intact
        await ac.delete("/api/v1/copilot/chat/clear", headers=headers_b)

        hist_a = (await ac.get("/api/v1/copilot/chat/history", headers=headers_a)).json()
        assert len(hist_a) >= 2
        assert "الجبر" in hist_a[-2]["content"]
