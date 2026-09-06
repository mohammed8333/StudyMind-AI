from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, DUMMY_TIMING_HASH
from app.core.rate_limiter import check_login_rate_limit, check_register_rate_limit
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserLogin,
    Token,
    UserResponse,
    UserUpdate,
    ChangePasswordRequest,
    VerifyEmailRequest,
    ResendCodeRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.services.email_service import (
    generate_otp_code,
    send_verification_email,
    send_password_reset_email,
)
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_register_rate_limit)
):
    """Register a new student account with Rate Limiting and OTP verification code generation."""
    normalized_email = user_in.email.strip().lower()
    stmt = select(User).where(User.email == normalized_email)
    res = await db.execute(stmt)
    if res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني مسجل مسبقاً في النظام."
        )

    # Generate 6-digit verification code with 15-minute validity
    code = generate_otp_code(6)
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    user = User(
        email=normalized_email,
        full_name=user_in.full_name.strip(),
        grade_or_level=user_in.grade_or_level.strip() if user_in.grade_or_level else None,
        phone_number=user_in.phone_number.strip() if user_in.phone_number else None,
        hashed_password=get_password_hash(user_in.password),
        is_active=True,
        is_verified=False,
        verification_code=code,
        verification_code_expires_at=expires_at,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Dispatch verification email (or log to server logs in dev mode)
    email_res = await send_verification_email(user.email, code, user.full_name)
    if email_res.get("code"):
        response.headers["X-Dev-Otp"] = email_res["code"]
    response.headers["X-Verification-Required"] = "true"

    return user

@router.post("/verify-email", response_model=Token)
async def verify_email(
    req: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db)
):
    """Verify student email address using the 6-digit OTP code."""
    stmt = select(User).where(User.email == req.email.strip().lower())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحساب غير موجود.")

    if user.is_verified:
        token = create_access_token(user.id)
        return Token(
            access_token=token,
            token_type="bearer",
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            is_verified=True,
        )

    if not user.verification_code or user.verification_code != req.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز التحقق غير صحيح. يرجى التأكد من كتابة الـ 6 أرقام بشكل سليم."
        )

    if user.verification_code_expires_at and user.verification_code_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="انتهت صلاحية رمز التحقق (15 دقيقة). يرجى الضغط على إعادة إرسال الرمز."
        )

    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        is_verified=True,
    )

@router.post("/resend-code", status_code=status.HTTP_200_OK)
async def resend_verification_code(
    req: ResendCodeRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Resend 6-digit OTP verification code."""
    stmt = select(User).where(User.email == req.email.strip().lower())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        return {"message": "إذا كان البريد مسجلاً، فقد تم إرسال رمز التحقق مجدداً."}

    if user.is_verified:
        return {"message": "هذا الحساب موثق بالفعل ومفعل."}

    code = generate_otp_code(6)
    user.verification_code = code
    user.verification_code_expires_at = datetime.utcnow() + timedelta(minutes=15)
    await db.commit()

    email_res = await send_verification_email(user.email, code, user.full_name)
    resp = {"message": "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني بنجاح."}
    if email_res.get("code"):
        response.headers["X-Dev-Otp"] = email_res["code"]
        resp["dev_code"] = email_res["code"]
    return resp

@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    req: ForgotPasswordRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Send password reset OTP code to registered student email."""
    stmt = select(User).where(User.email == req.email.strip().lower())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        # Enumeration shield: return same message
        return {"message": "إذا كان البريد مسجلاً في النظام، فقد تم إرسال رمز استعادة الحساب."}

    code = generate_otp_code(6)
    user.reset_password_code = code
    user.reset_password_expires_at = datetime.utcnow() + timedelta(minutes=15)
    await db.commit()

    email_res = await send_password_reset_email(user.email, code, user.full_name)
    resp = {"message": "إذا كان البريد مسجلاً في النظام، فقد تم إرسال رمز استعادة الحساب."}
    if email_res.get("code"):
        response.headers["X-Dev-Otp"] = email_res["code"]
        resp["dev_code"] = email_res["code"]
    return resp

@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    req: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """Reset forgotten password using the received OTP code."""
    stmt = select(User).where(User.email == req.email.strip().lower())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز الاستعادة غير صحيح أو الحساب غير موجود."
        )

    if not user.reset_password_code or user.reset_password_code != req.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز الاستعادة غير صحيح."
        )

    if user.reset_password_expires_at and user.reset_password_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="انتهت صلاحية رمز الاستعادة (15 دقيقة). يرجى طلب رمز جديد."
        )

    user.hashed_password = get_password_hash(req.new_password)
    user.reset_password_code = None
    user.reset_password_expires_at = None
    # Resetting password via email proves email ownership
    user.is_verified = True
    await db.commit()

    return {"message": "تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة."}

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(check_login_rate_limit)
):
    """
    Login with username/email and password (OAuth2 Form).
    Protected against Rate-Limiting brute force, User Enumeration timing attacks,
    and unverified account hijacking.
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

    if settings.REQUIRE_EMAIL_VERIFICATION and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="يرجى تأكيد البريد الإلكتروني أولاً باستخدام رمز التحقق المرسل لك.",
            headers={"X-Verification-Required": "true"}
        )
        
    token = create_access_token(user.id)
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        is_verified=user.is_verified
    )

@router.get("/me", response_model=UserResponse)
async def get_current_student(user: User = Depends(get_current_user)):
    """Get profile details of the authenticated student."""
    return user

@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    user_in: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update profile details (name, grade level) of the authenticated student."""
    if user_in.full_name is not None:
        user.full_name = user_in.full_name.strip()
    if user_in.grade_or_level is not None:
        user.grade_or_level = user_in.grade_or_level.strip()
        
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_my_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change the authenticated student's password after verifying the current password."""
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="كلمة المرور الحالية غير صحيحة."
        )
    if req.new_password == req.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية."
        )
    user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return {"message": "تم تغيير كلمة المرور بنجاح."}

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
