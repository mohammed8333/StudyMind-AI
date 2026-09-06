import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.user import User


@pytest.mark.asyncio
async def test_registration_generates_verification_code():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"verify_test_{datetime.utcnow().timestamp()}@example.com"
        reg_res = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "StrongPassword123!",
                "full_name": "طالب تجربة التحقق",
                "phone_number": "01012345678"
            }
        )
        assert reg_res.status_code == 201
        data = reg_res.json()
        assert data["email"] == email
        assert data["is_verified"] is False
        assert data["phone_number"] == "01012345678"
        assert reg_res.headers.get("x-verification-required") == "true"

        # Check DB that code and expiration are stored
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            assert user is not None
            assert user.verification_code is not None
            assert len(user.verification_code) == 6
            assert user.verification_code_expires_at is not None
            assert user.verification_code_expires_at > datetime.utcnow()


@pytest.mark.asyncio
async def test_verify_email_success_and_wrong_code():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"verify_flow_{datetime.utcnow().timestamp()}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "StrongPassword123!",
                "full_name": "طالب التدقيق"
            }
        )

        # Get code from database
        code = None
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            code = user.verification_code

        assert code is not None

        # 1. Try wrong code
        wrong_res = await ac.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "code": "000000" if code != "000000" else "111111"}
        )
        assert wrong_res.status_code == 400
        assert "غير صحيح" in wrong_res.json()["detail"]

        # 2. Try correct code
        valid_res = await ac.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "code": code}
        )
        assert valid_res.status_code == 200
        token_data = valid_res.json()
        assert "access_token" in token_data
        assert token_data["is_verified"] is True
        assert token_data["email"] == email

        # 3. Verify in DB that is_verified is True and code cleared
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            updated_user = res.scalars().first()
            assert updated_user.is_verified is True
            assert updated_user.verification_code is None


@pytest.mark.asyncio
async def test_verify_email_expired_code():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"expired_test_{datetime.utcnow().timestamp()}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "StrongPassword123!",
                "full_name": "طالب منتهي الصلاحية"
            }
        )

        # Expire code in DB
        code = None
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            code = user.verification_code
            user.verification_code_expires_at = datetime.utcnow() - timedelta(minutes=5)
            await session.commit()

        # Try to verify with expired code
        exp_res = await ac.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "code": code}
        )
        assert exp_res.status_code == 400
        assert "انتهت صلاحية" in exp_res.json()["detail"]


@pytest.mark.asyncio
async def test_resend_verification_code():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"resend_test_{datetime.utcnow().timestamp()}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "StrongPassword123!",
                "full_name": "طالب إعادة الإرسال"
            }
        )

        old_code = None
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            old_code = user.verification_code

        resend_res = await ac.post(
            "/api/v1/auth/resend-code",
            json={"email": email}
        )
        assert resend_res.status_code == 200

        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            assert user.verification_code is not None
            assert user.verification_code_expires_at > datetime.utcnow()


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"reset_flow_{datetime.utcnow().timestamp()}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "OldPassword123!",
                "full_name": "طالب نسى كلمة السر"
            }
        )

        # 1. Request forgot password
        forgot_res = await ac.post(
            "/api/v1/auth/forgot-password",
            json={"email": email}
        )
        assert forgot_res.status_code == 200

        # Retrieve reset code from DB
        reset_code = None
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == email)
            res = await session.execute(stmt)
            user = res.scalars().first()
            reset_code = user.reset_password_code

        assert reset_code is not None

        # 2. Reset password using code
        reset_res = await ac.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": reset_code,
                "new_password": "NewBrandPassword456!"
            }
        )
        assert reset_res.status_code == 200
        assert "تم إعادة تعيين" in reset_res.json()["message"]

        # 3. Login with new password
        login_res = await ac.post(
            "/api/v1/auth/login",
            data={"username": email, "password": "NewBrandPassword456!"}
        )
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()


@pytest.mark.asyncio
async def test_require_email_verification_setting():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        email = f"require_setting_{datetime.utcnow().timestamp()}@example.com"
        await ac.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "Password789!",
                "full_name": "طالب التحقق الإلزامي"
            }
        )

        # Enable REQUIRE_EMAIL_VERIFICATION temporarily
        original_setting = settings.REQUIRE_EMAIL_VERIFICATION
        try:
            settings.REQUIRE_EMAIL_VERIFICATION = True

            # Should be blocked with 403
            blocked_login = await ac.post(
                "/api/v1/auth/login",
                data={"username": email, "password": "Password789!"}
            )
            assert blocked_login.status_code == 403
            assert "تأكيد البريد" in blocked_login.json()["detail"]

            # Verify the email
            code = None
            async with AsyncSessionLocal() as session:
                stmt = select(User).where(User.email == email)
                res = await session.execute(stmt)
                user = res.scalars().first()
                code = user.verification_code

            verify_res = await ac.post(
                "/api/v1/auth/verify-email",
                json={"email": email, "code": code}
            )
            assert verify_res.status_code == 200

            # Now login should succeed
            allowed_login = await ac.post(
                "/api/v1/auth/login",
                data={"username": email, "password": "Password789!"}
            )
            assert allowed_login.status_code == 200
            assert "access_token" in allowed_login.json()
        finally:
            settings.REQUIRE_EMAIL_VERIFICATION = original_setting
