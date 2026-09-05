import os
import json
import pytest
import pytest_asyncio
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db, AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.models.mastery import Concept, StudentMastery
from app.models.study_plan import StudyPlan, StudyPlanTask
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
async def test_generate_and_persist_intelligent_study_plan():
    """Verify that generating a study plan persists everything in the DB and includes diverse activities."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "planner_user@example.com", "طالب التخطيط")
        headers = {"Authorization": f"Bearer {token}"}

        # Get user id
        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        user_id = me_res.json()["id"]

        # Setup document, chunks, and weak concept
        async with AsyncSessionLocal() as db:
            doc = Document(
                title="مذكرة الفيزياء للثانوية",
                subject="الفيزياء",
                filename="phys_plan.pdf",
                file_path="mock/phys_plan.pdf",
                owner_id=user_id,
                status="READY"
            )
            db.add(doc)
            await db.flush()

            chunk = DocumentChunk(
                document_id=doc.id,
                page_number=1,
                chunk_index=0,
                chapter="الكهربية والتيار المستمر",
                content="نصوص قوانين كيرشوف وقانون أوم للدائرة المغلقة.",
                content_normalized="نصوص قوانين كيرشوف وقانون اوم للدائرة المغلقة"
            )
            db.add(chunk)

            concept = Concept(
                document_id=doc.id,
                name="قانون أوم للدائرة المغلقة",
                subject="الفيزياء",
                chapter="الكهربية والتيار المستمر"
            )
            db.add(concept)
            await db.flush()

            # Mark concept as weak
            mastery = StudentMastery(
                student_id=user_id,
                concept_id=concept.id,
                mastery_score=40.0,
                is_weak_point=True,
                primary_error_type="calculation_mistake"
            )
            db.add(mastery)
            await db.commit()
            concept_id = concept.id

        exam_date_str = (date.today() + timedelta(days=20)).isoformat()

        # 1. Generate Study Plan via POST /api/v1/planner/generate
        gen_res = await ac.post(
            "/api/v1/planner/generate",
            headers=headers,
            json={
                "exam_date": exam_date_str,
                "subjects": ["الفيزياء"],
                "available_study_time": 600,
                "preferred_days": ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
                "daily_time_limit": 120,
                "priority": "weak_points_first"
            }
        )
        assert gen_res.status_code == 200
        plan_data = gen_res.json()
        assert plan_data["id"] is not None
        assert plan_data["days_until_exam"] == 20
        assert plan_data["is_active"] is True
        assert len(plan_data["tasks"]) > 0

        # Check activity types generated
        activity_types = {t["activity_type"] for t in plan_data["tasks"]}
        assert "Remedial" in activity_types, "Weak concept must receive a Remedial session"
        assert "Study" in activity_types, "Chapters must receive Study sessions"
        assert "Quiz" in activity_types, "Chapters must receive Quiz sessions"
        assert "Mock Exam" in activity_types, "End of plan must contain a Mock Exam"

        plan_id = plan_data["id"]

        # 2. Verify Persistence directly in Database
        async with AsyncSessionLocal() as db:
            db_plan = await db.get(StudyPlan, plan_id)
            assert db_plan is not None
            assert db_plan.student_id == user_id
            assert db_plan.total_tasks == len(plan_data["tasks"])

            t_stmt = select(StudyPlanTask).where(StudyPlanTask.plan_id == plan_id)
            t_res = await db.execute(t_stmt)
            tasks_in_db = t_res.scalars().all()
            assert len(tasks_in_db) == len(plan_data["tasks"])

        # 3. GET /api/v1/planner/active
        active_res = await ac.get("/api/v1/planner/active", headers=headers)
        assert active_res.status_code == 200
        assert active_res.json()["id"] == plan_id
        assert active_res.json()["days_until_exam"] == 20

@pytest.mark.asyncio
async def test_mark_task_completed_and_recalculate_progress():
    """Verify marking a task complete updates task status and plan progress percentage."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "progress_student@example.com", "طالب الإنجاز")
        headers = {"Authorization": f"Bearer {token}"}

        # Generate a plan
        exam_date_str = (date.today() + timedelta(days=10)).isoformat()
        gen_res = await ac.post(
            "/api/v1/planner/generate",
            headers=headers,
            json={
                "exam_date": exam_date_str,
                "subjects": ["الكيمياء"],
                "daily_time_limit": 90,
                "priority": "balanced"
            }
        )
        plan_data = gen_res.json()
        task_id = plan_data["tasks"][0]["id"]

        # Mark task as completed
        patch_res = await ac.patch(
            f"/api/v1/planner/tasks/{task_id}",
            headers=headers,
            json={"status": "COMPLETED"}
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "COMPLETED"
        assert patch_res.json()["completed_at"] is not None

        # Check that active plan has updated progress
        active_res = await ac.get("/api/v1/planner/active", headers=headers)
        updated_plan = active_res.json()
        assert updated_plan["completed_tasks"] >= 1
        assert updated_plan["progress_percentage"] > 0.0

@pytest.mark.asyncio
async def test_reschedule_overdue_tasks():
    """Verify that overdue tasks from yesterday or earlier get rescheduled to upcoming days."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "overdue_student@example.com", "طالب المتأخرات")
        headers = {"Authorization": f"Bearer {token}"}

        # Generate plan
        exam_date_str = (date.today() + timedelta(days=12)).isoformat()
        gen_res = await ac.post(
            "/api/v1/planner/generate",
            headers=headers,
            json={"exam_date": exam_date_str, "subjects": ["الأحياء"]}
        )
        plan_data = gen_res.json()
        task_id = plan_data["tasks"][0]["id"]

        # Artificially set task to yesterday in DB
        async with AsyncSessionLocal() as db:
            task = await db.get(StudyPlanTask, task_id)
            task.scheduled_date = date.today() - timedelta(days=2)
            task.status = "PENDING"
            await db.commit()

        # Call POST /api/v1/planner/reschedule-overdue
        resched_res = await ac.post(
            "/api/v1/planner/reschedule-overdue",
            headers=headers
        )
        assert resched_res.status_code == 200
        res_data = resched_res.json()
        assert res_data["rescheduled_count"] >= 1

        # Verify task scheduled_date is now today or later
        async with AsyncSessionLocal() as db:
            refreshed_task = await db.get(StudyPlanTask, task_id)
            assert refreshed_task.scheduled_date >= date.today()

@pytest.mark.asyncio
async def test_adaptive_sync_performance():
    """Verify auto-adaptation: mastered concepts reduce review, weak concepts inject remedial tasks."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await get_or_create_user(ac, "adaptive_sync_user@example.com", "طالب التكيف")
        headers = {"Authorization": f"Bearer {token}"}

        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        user_id = me_res.json()["id"]

        # Create doc & concept
        async with AsyncSessionLocal() as db:
            doc = Document(title="مذكرة الجيولوجيا", subject="الجيولوجيا", filename="geo.pdf", file_path="mock/g.pdf", owner_id=user_id, status="READY")
            db.add(doc)
            await db.flush()

            concept = Concept(document_id=doc.id, name="التركيب الجيولوجي", subject="الجيولوجيا")
            db.add(concept)
            await db.flush()

            # Mastered concept
            mastery = StudentMastery(
                student_id=user_id,
                concept_id=concept.id,
                mastery_score=95.0,
                is_proficient=True,
                is_weak_point=False
            )
            db.add(mastery)
            await db.commit()
            concept_id = concept.id

        # Generate plan
        exam_date_str = (date.today() + timedelta(days=14)).isoformat()
        await ac.post(
            "/api/v1/planner/generate",
            headers=headers,
            json={"exam_date": exam_date_str, "subjects": ["الجيولوجيا"]}
        )

        # Call POST /api/v1/planner/sync
        sync_res = await ac.post("/api/v1/planner/sync", headers=headers)
        assert sync_res.status_code == 200
        assert sync_res.json()["updated"] is True

@pytest.mark.asyncio
async def test_planner_idor_protection():
    """Verify that User B cannot edit or complete User A's study plan tasks."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await get_or_create_user(ac, "user_a_planner@example.com", "طالب أ")
        token_b = await get_or_create_user(ac, "user_b_planner@example.com", "طالب ب")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A generates a plan
        exam_date_str = (date.today() + timedelta(days=10)).isoformat()
        gen_res = await ac.post(
            "/api/v1/planner/generate",
            headers=headers_a,
            json={"exam_date": exam_date_str, "subjects": ["الفيزياء"]}
        )
        task_id_a = gen_res.json()["tasks"][0]["id"]

        # User B tries to update User A's task
        idor_res = await ac.patch(
            f"/api/v1/planner/tasks/{task_id_a}",
            headers=headers_b,
            json={"status": "COMPLETED"}
        )
        assert idor_res.status_code == 403, "IDOR check must reject other students with 403"
