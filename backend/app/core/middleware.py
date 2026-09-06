from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware that attaches essential security headers to all HTTP responses.
    Protects against MIME sniffing, clickjacking, framing attacks, and restricts browser features.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        
        # 1. Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # 2. Prevent clickjacking by disallowing framing
        response.headers["X-Frame-Options"] = "DENY"
        
        # 3. Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # 4. Permissions policy restricting sensitive device APIs
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        
        # 5. Disable legacy buggy XSS auditor
        response.headers["X-XSS-Protection"] = "0"
        
        # 6. CSP for API responses (exempt OpenAPI /docs so Swagger UI CDN assets load)
        path = request.url.path
        if not (path.startswith("/docs") or path.startswith("/openapi.json") or path.startswith("/redoc")):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' data: https://fonts.gstatic.com; "
                "frame-ancestors 'none';"
            )
            
        return response
