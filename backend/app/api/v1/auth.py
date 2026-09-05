from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, DUMMY_TIMING_HASH
from app.core.rate_limiter import check_login_rate_limit, check_register_rate_limit
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, Token, UserResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_register_rate_limit)
):
    """Register a new student account with Rate Limiting protection."""
    stmt = select(User).where(User.email == user_in.email)
    res = await db.execute(stmt)
    if res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني مسجل مسبقاً في النظام."
        )
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        grade_or_level=user_in.grade_or_level,
        hashed_password=get_password_hash(user_in.password),
        is_active=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_login_rate_limit)
):
    """
    Login with username/email and password (OAuth2 Form).
    Protected against Rate-Limiting brute force and User Enumeration timing attacks.
    """
    stmt = select(User).where(User.email == form_data.username)
    res = await db.execute(stmt)
    user = res.scalars().first()
    
    # Timing attack shield: run bcrypt verification against dummy hash if user does not exist
    if not user:
        verify_password(form_data.password, DUMMY_TIMING_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="بيانات الدخول غير صحيحة.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="بيانات الدخول غير صحيحة.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token = create_access_token(user.id)
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        full_name=user.full_name,
        email=user.email
    )

@router.get("/me", response_model=UserResponse)
async def get_current_student(user: User = Depends(get_current_user)):
    """Get profile details of the authenticated student."""
    return user

@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_my_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete the authenticated student account along with all their documents, quizzes, and data."""
    # Delete uploaded files from disk if they exist
    from app.models.document import Document
    import os
    stmt = select(Document).where(Document.owner_id == user.id)
    res = await db.execute(stmt)
    docs = res.scalars().all()
    for d in docs:
        if d.file_path and os.path.exists(d.file_path):
            try:
                os.remove(d.file_path)
            except Exception:
                pass

    await db.delete(user)
    await db.commit()
    return {"message": "تم حذف الحساب وجميع البيانات المتعلقة به بنجاح."}
