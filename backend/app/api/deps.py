from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import get_db
from app.core.security import oauth2_scheme, decode_access_token
from app.models.user import User

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="تعذر التحقق من بيانات الدخول",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id_str = decode_access_token(token)
    if user_id_str is None:
        raise credentials_exception
        
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise credentials_exception
        
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_exception

    if settings.REQUIRE_EMAIL_VERIFICATION and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="يرجى تأكيد البريد الإلكتروني أولاً لتفعيل الحساب.",
            headers={"X-Verification-Required": "true"}
        )

    return user
