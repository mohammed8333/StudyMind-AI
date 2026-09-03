import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db

@pytest_asyncio.fixture(autouse=True)
async def prepare_db():
    await init_db()

@pytest.mark.asyncio
async def test_root_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "online"
        assert "StudyMind" in data["project"]

@pytest.mark.asyncio
async def test_auth_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register student
        reg_payload = {
            "email": "ahmed_student@example.com",
            "password": "pass1234Secure!",
            "full_name": "أحمد محمد علي",
            "grade_or_level": "الثانوية العامة - علمي علوم"
        }
        res = await ac.post("/api/v1/auth/register", json=reg_payload)
        assert res.status_code in [201, 400]  # 400 if already created in previous run
        
        # 2. Login
        login_res = await ac.post(
            "/api/v1/auth/login",
            data={"username": "ahmed_student@example.com", "password": "pass1234Secure!"}
        )
        assert login_res.status_code == 200
        token_data = login_res.json()
        assert "access_token" in token_data
        token = token_data["access_token"]
        
        # 3. Access /me with token
        me_res = await ac.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == "ahmed_student@example.com"
        assert me_data["full_name"] == "أحمد محمد علي"

@pytest.mark.asyncio
async def test_analytics_empty_dashboard():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Login
        login_res = await ac.post(
            "/api/v1/auth/login",
            data={"username": "ahmed_student@example.com", "password": "pass1234Secure!"}
        )
        token = login_res.json()["access_token"]
        
        # Check Dashboard
        dash_res = await ac.get(
            "/api/v1/analytics/dashboard",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert dash_res.status_code == 200
        data = dash_res.json()
        assert "total_quizzes_taken" in data
        assert "recommended_revision_plan" in data
