from pydantic import BaseModel, EmailStr, ConfigDict, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    grade_or_level: Optional[str] = None
    phone_number: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128, description="Password between 8 and 128 characters")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    full_name: str
    email: str
    is_verified: bool = True

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool = False
    phone_verified: bool = False
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class RegisterResponse(BaseModel):
    user: UserResponse
    message: str
    requires_verification: bool = True
    dev_code: Optional[str] = None

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, description="رمز التحقق المكون من 6 أرقام")

class ResendCodeRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, description="رمز التحقق المكون من 6 أرقام")
    new_password: str = Field(..., min_length=8, max_length=128, description="كلمة المرور الجديدة بين 8 و128 حرفاً")

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    grade_or_level: Optional[str] = Field(None, max_length=100)
    phone_number: Optional[str] = Field(None, max_length=20)

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="كلمة المرور الحالية")
    new_password: str = Field(..., min_length=8, max_length=128, description="كلمة المرور الجديدة بين 8 و128 حرفاً")

