import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Union, Any
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# Pre-computed dummy hash to prevent user enumeration timing attacks on failed login attempts
DUMMY_TIMING_HASH = "$2b$12$e8Y5tGq6w8eRz1q1q1q1qu9n0a8q9w8e7r6t5y4u3i2o1p0z9y8x."

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies plain password against bcrypt hash, safely truncating to 72 bytes."""
    try:
        if not plain_password or not hashed_password:
            return False
        pw_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Generates bcrypt hash for password, safely truncating to 72 bytes."""
    pw_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pw_bytes, salt).decode('utf-8')

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[str]:
    """
    Decodes and validates a JWT access token.
    Enforces signature verification, expiration check, and subject validation.
    Returns subject string if valid, None otherwise.
    """
    if not token or not isinstance(token, str):
        return None
    token = token.strip()
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_signature": True, "verify_exp": True}
        )
        sub = payload.get("sub")
        if sub is None or str(sub).strip() == "":
            return None
        return str(sub)
    except JWTError:
        return None
    except Exception:
        return None
