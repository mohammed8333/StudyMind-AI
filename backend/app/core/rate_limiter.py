import time
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
from fastapi import Request, HTTPException, status, Depends
from app.core.config import settings
from app.api.deps import get_current_user
from app.models.user import User

class SlidingWindowRateLimiter:
    """
    High-performance in-memory sliding window rate limiter.
    Stores timestamps of requests per key within the configured window.
    """
    def __init__(self):
        # Key: (category:identifier) -> list of timestamp floats
        self._requests: Dict[str, List[float]] = defaultdict(list)
        
        # Category -> (max_requests, window_seconds)
        self.limits: Dict[str, Tuple[int, int]] = {
            "login": (5, 60),             # 5 requests / 60 seconds per IP
            "register": (3, 60),          # 3 requests / 60 seconds per IP
            "document_upload": (10, 60),  # 10 uploads / 60 seconds per user
            "ai_chat": (30, 60),          # 30 chat messages / 60 seconds per user
            "quiz_generate": (10, 60),    # 10 quiz gens / 60 seconds per user
            "exam_generate": (5, 60),     # 5 exam gens / 60 seconds per user
            "default": (120, 60),         # 120 requests / 60 seconds general
        }

    def reset(self):
        """Clears all stored rate limit records (useful for automated testing)."""
        self._requests.clear()

    def _get_client_ip(self, request: Request) -> str:
        """Extracts client IP safely handling X-Forwarded-For headers."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[0]
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    def check(
        self,
        request: Request,
        category: str = "default",
        user_id: Optional[int] = None
    ) -> None:
        """
        Validates whether the incoming request exceeds the configured rate limit.
        Raises HTTPException 429 with standard RateLimit headers if exceeded.
        """
        if getattr(settings, "DISABLE_RATE_LIMIT", False):
            return

        now = time.time()
        max_requests, window_seconds = self.limits.get(category, self.limits["default"])

        if user_id is not None:
            identifier = f"user:{user_id}"
        else:
            identifier = f"ip:{self._get_client_ip(request)}"

        rate_key = f"{category}:{identifier}"
        cutoff = now - window_seconds

        # Prune expired timestamps
        active_timestamps = [t for t in self._requests[rate_key] if t > cutoff]
        self._requests[rate_key] = active_timestamps

        if len(active_timestamps) >= max_requests:
            oldest_ts = active_timestamps[0]
            retry_after = max(1, int(window_seconds - (now - oldest_ts)))
            reset_ts = int(oldest_ts + window_seconds)
            
            headers = {
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(max_requests),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_ts)
            }
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"تم تجاوز الحد المسموح به للعملية ({category}). يرجى الانتظار {retry_after} ثانية قبل المحاولة مجدداً.",
                headers=headers
            )

        # Record this request timestamp
        self._requests[rate_key].append(now)

rate_limiter = SlidingWindowRateLimiter()

# -------------------------------------------------------------
# FastAPI Dependencies for Endpoints
# -------------------------------------------------------------

async def check_login_rate_limit(request: Request) -> None:
    rate_limiter.check(request, category="login")

async def check_register_rate_limit(request: Request) -> None:
    rate_limiter.check(request, category="register")

async def check_upload_rate_limit(request: Request, user: User = Depends(get_current_user)) -> None:
    rate_limiter.check(request, category="document_upload", user_id=user.id)

async def check_chat_rate_limit(request: Request, user: User = Depends(get_current_user)) -> None:
    rate_limiter.check(request, category="ai_chat", user_id=user.id)

async def check_quiz_rate_limit(request: Request, user: User = Depends(get_current_user)) -> None:
    rate_limiter.check(request, category="quiz_generate", user_id=user.id)
