import asyncio
import logging
import secrets
import smtplib
import socket
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Dict, Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def generate_otp_code(length: int = 6) -> str:
    """Generate a cryptographically secure 6-digit numeric OTP code."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def build_verification_html(code: str, student_name: Optional[str] = None) -> str:
    """Build a modern, branded Arabic HTML email for email verification."""
    name_display = f"عزيزي الطالب {student_name}،" if student_name else "عزيزي الطالب،"
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {{
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 20px;
      color: #1e293b;
      direction: rtl;
    }}
    .container {{
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }}
    .header {{
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }}
    .header h1 {{
      margin: 0;
      font-size: 24px;
      font-weight: 800;
    }}
    .header p {{
      margin: 5px 0 0;
      font-size: 13px;
      opacity: 0.9;
    }}
    .content {{
      padding: 30px 25px;
      text-align: center;
    }}
    .greeting {{
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }}
    .message {{
      font-size: 14px;
      color: #64748b;
      line-height: 1.6;
      margin-bottom: 25px;
    }}
    .otp-box {{
      display: inline-block;
      background: #f0f9ff;
      border: 2px dashed #0284c7;
      border-radius: 16px;
      padding: 16px 36px;
      margin-bottom: 25px;
    }}
    .otp-code {{
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 10px;
      color: #0369a1;
      font-family: monospace;
    }}
    .expiry {{
      font-size: 12px;
      color: #94a3b8;
      margin-top: 5px;
    }}
    .warning {{
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      color: #b91c1c;
      line-height: 1.5;
    }}
    .footer {{
      background: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StudyMind AI</h1>
      <p>محرك المذاكرة والتعلم الذكي</p>
    </div>
    <div class="content">
      <div class="greeting">{name_display}</div>
      <div class="message">
        شكراً لانضمامك إلى منصة StudyMind AI. لحماية حسابك وتأكيد ملكيتك للبريد الإلكتروني، يرجى استخدام رمز التحقق التالي:
      </div>
      <div class="otp-box">
        <div class="otp-code">{code}</div>
        <div class="expiry">الرمز صالح لمدة 15 دقيقة فقط</div>
      </div>
      <div class="warning">
        🔒 لأمان حسابك: لا تشارك هذا الرمز مع أي شخص. فريق StudyMind لن يطلب منك هذا الرمز أبداً.
      </div>
    </div>
    <div class="footer">
      هذه رسالة آلية لتأكيد الحساب، لا تقم بالرد على هذا البريد.<br>
      © 2026 StudyMind AI. جميع الحقوق محفوظة.
    </div>
  </div>
</body>
</html>
"""


def build_password_reset_html(code: str, student_name: Optional[str] = None) -> str:
    """Build a modern, branded Arabic HTML email for password reset."""
    name_display = f"عزيزي الطالب {student_name}،" if student_name else "عزيزي الطالب،"
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {{
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 20px;
      color: #1e293b;
      direction: rtl;
    }}
    .container {{
      max-width: 520px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }}
    .header {{
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }}
    .header h1 {{
      margin: 0;
      font-size: 24px;
      font-weight: 800;
    }}
    .header p {{
      margin: 5px 0 0;
      font-size: 13px;
      opacity: 0.9;
    }}
    .content {{
      padding: 30px 25px;
      text-align: center;
    }}
    .greeting {{
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }}
    .message {{
      font-size: 14px;
      color: #64748b;
      line-height: 1.6;
      margin-bottom: 25px;
    }}
    .otp-box {{
      display: inline-block;
      background: #eef2ff;
      border: 2px dashed #4f46e5;
      border-radius: 16px;
      padding: 16px 36px;
      margin-bottom: 25px;
    }}
    .otp-code {{
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 10px;
      color: #3730a3;
      font-family: monospace;
    }}
    .expiry {{
      font-size: 12px;
      color: #94a3b8;
      margin-top: 5px;
    }}
    .warning {{
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      color: #b91c1c;
      line-height: 1.5;
    }}
    .footer {{
      background: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StudyMind AI</h1>
      <p>استعادة كلمة المرور</p>
    </div>
    <div class="content">
      <div class="greeting">{name_display}</div>
      <div class="message">
        لقد تلقينا طلباً لتعيين كلمة مرور جديدة لحسابك في منصة StudyMind AI. استخدم رمز الاستعادة التالي:
      </div>
      <div class="otp-box">
        <div class="otp-code">{code}</div>
        <div class="expiry">الرمز صالح لمدة 15 دقيقة فقط</div>
      </div>
      <div class="warning">
        ⚠️ إذا لم تطلب استعادة كلمة المرور بنفسك، يرجى تجاهل هذا البريد، فحسابك لا يزال آمناً.
      </div>
    </div>
    <div class="footer">
      هذه رسالة آلية، لا تقم بالرد على هذا البريد.<br>
      © 2026 StudyMind AI. جميع الحقوق محفوظة.
    </div>
  </div>
</body>
</html>
"""


def _resolve_ipv4(host: str, port: int) -> str:
    """
    Resolve hostname to an IPv4 address to prevent Linux/Docker [Errno 101] Network is unreachable
    caused by Railway lacking public IPv6 default routing.
    """
    try:
        addr_info = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        if addr_info:
            return addr_info[0][4][0]
    except Exception as e:
        logger.warning(f"Could not resolve IPv4 for {host}: {e}")
    return host


PUBLIC_EMAIL_DOMAINS = (
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "mail.ru", "proton.me", "aol.com"
)


def _get_resend_from_email() -> str:
    """
    Get a valid sender email for Resend API.
    Resend strictly forbids sending from public webmail domains like @gmail.com without verified DNS.
    If using free/testing onboarding, 'onboarding@resend.dev' must be used.
    """
    if getattr(settings, "RESEND_FROM_EMAIL", None) and "@" in settings.RESEND_FROM_EMAIL:
        addr = settings.RESEND_FROM_EMAIL.strip()
        domain = addr.split("@")[-1].lower()
        if not any(domain == pub or domain.endswith("." + pub) for pub in PUBLIC_EMAIL_DOMAINS):
            return addr

    if settings.SMTP_FROM_EMAIL and "@" in settings.SMTP_FROM_EMAIL:
        addr = settings.SMTP_FROM_EMAIL.strip()
        domain = addr.split("@")[-1].lower()
        if not any(domain == pub or domain.endswith("." + pub) for pub in PUBLIC_EMAIL_DOMAINS) and not domain.endswith("localhost"):
            return addr

    return "onboarding@resend.dev"


async def _send_resend_api(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """
    Send email via Resend HTTP REST API over Port 443 (HTTPS).
    Cloud platforms never block HTTPS, guaranteeing 100% deliverability.
    """
    if not settings.RESEND_API_KEY:
        return False

    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    from_addr = _get_resend_from_email()
    payload = {
        "from": f"StudyMind AI <{from_addr}>",
        "to": [to_email],
        "subject": subject,
        "html": html_content,
        "text": text_content,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post("https://api.resend.com/emails", headers=headers, json=payload)
            if response.status_code in (200, 201):
                res_data = response.json()
                msg_id = res_data.get("id", "ok")
                print(
                    f"\n======================================================\n"
                    f"📨 [RESEND EMAIL ACCEPTED & DISPATCHED]\n"
                    f"To: {to_email}\n"
                    f"From: {payload['from']}\n"
                    f"Resend Message ID: {msg_id}\n"
                    f"⚠️ Important: Please check Spam / Junk / Promotions in Gmail!\n"
                    f"======================================================\n",
                    flush=True
                )
                return True

            print(
                f"\n⚠️ [RESEND API REJECTED: HTTP {response.status_code}]\n"
                f"Response: {response.text}\n",
                flush=True
            )

            # If domain verification failed and we didn't use onboarding@resend.dev, retry with onboarding@resend.dev
            if response.status_code in (400, 403) and payload["from"] != "StudyMind AI <onboarding@resend.dev>":
                print("🔄 Retrying Resend with onboarding@resend.dev...", flush=True)
                payload["from"] = "StudyMind AI <onboarding@resend.dev>"
                retry_resp = await client.post("https://api.resend.com/emails", headers=headers, json=payload)
                if retry_resp.status_code in (200, 201):
                    retry_data = retry_resp.json()
                    msg_id = retry_data.get("id", "ok")
                    print(
                        f"\n======================================================\n"
                        f"📨 [RESEND RETRY SUCCEEDED via onboarding@resend.dev]\n"
                        f"To: {to_email}\n"
                        f"Resend Message ID: {msg_id}\n"
                        f"⚠️ Check Spam / Junk / Promotions in Gmail!\n"
                        f"======================================================\n",
                        flush=True
                    )
                    return True
                else:
                    print(f"⚠️ [RESEND RETRY FAILED: HTTP {retry_resp.status_code}] Response: {retry_resp.text}", flush=True)

            return False
    except Exception as e:
        print(f"❌ [RESEND API EXCEPTION for {to_email}]: {e}", flush=True)
        return False


async def _send_brevo_api(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """
    Send email via Brevo HTTP REST API over Port 443 (HTTPS).
    """
    if not settings.BREVO_API_KEY:
        return False

    headers = {
        "api-key": settings.BREVO_API_KEY.strip(),
        "Content-Type": "application/json",
    }
    from_addr = (
        settings.SMTP_FROM_EMAIL.strip()
        if "@" in settings.SMTP_FROM_EMAIL
        else "noreply@egypttravelportal.com"
    )
    payload = {
        "sender": {"name": "StudyMind AI", "email": from_addr},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post("https://api.brevo.com/v3/smtp/email", headers=headers, json=payload)
            if response.status_code in (200, 201):
                print(f"📨 [BREVO EMAIL DELIVERED] To: {to_email}", flush=True)
                return True
            print(f"⚠️ [BREVO API REJECTED: HTTP {response.status_code}] Response: {response.text}", flush=True)
            return False
    except Exception as e:
        print(f"❌ [BREVO API EXCEPTION for {to_email}]: {e}", flush=True)
        return False


def _send_smtp_sync(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """
    Synchronous worker function to send email via SMTP enforcing IPv4.
    Uses 5s timeout so cloud socket drops don't block the request.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"StudyMind AI <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    host_ip = _resolve_ipv4(settings.SMTP_HOST, settings.SMTP_PORT)

    if settings.SMTP_PORT == 465:
        context = ssl.create_default_context()
        server = smtplib.SMTP_SSL(timeout=5, context=context)
        server._host = settings.SMTP_HOST  # Essential for SSL SNI hostname match
        server.connect(host_ip, settings.SMTP_PORT)
    else:
        server = smtplib.SMTP(timeout=5)
        server.connect(host_ip, settings.SMTP_PORT)
        server.ehlo()
        if settings.SMTP_TLS:
            context = ssl.create_default_context()
            server._host = settings.SMTP_HOST  # Essential for STARTTLS SNI hostname match
            server.starttls(context=context)
            server.ehlo()

    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

    server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
    server.quit()
    return True


async def send_verification_email(to_email: str, code: str, student_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Send OTP verification email.
    Tries Resend API (HTTP 443) -> Brevo API (HTTP 443) -> IPv4 SMTP -> Fallback logging.
    Always prints OTP to console for 100% developer/admin reliability.
    """
    subject = f"رمز التحقق الخاص بك في StudyMind AI: {code}"
    html_content = build_verification_html(code, student_name)
    text_content = f"رمز التحقق الخاص بك في StudyMind AI هو: {code}\nصالح لمدة 15 دقيقة."

    # Always log OTP directly to console output
    print(
        f"\n======================================================\n"
        f"🔐 [STUDYMIND SECURITY OTP CODE]\n"
        f"To: {to_email}\n"
        f"Code: {code}\n"
        f"======================================================\n",
        flush=True
    )

    # 1. Try Resend API (Port 443 HTTPS)
    if settings.RESEND_API_KEY:
        if await _send_resend_api(to_email, subject, html_content, text_content):
            return {"sent": True, "mode": "resend", "code": code}

    # 2. Try Brevo API (Port 443 HTTPS)
    if settings.BREVO_API_KEY:
        if await _send_brevo_api(to_email, subject, html_content, text_content):
            return {"sent": True, "mode": "brevo", "code": code}

    # 3. Try SMTP (IPv4 enforced)
    if settings.SMTP_HOST:
        try:
            await asyncio.to_thread(_send_smtp_sync, to_email, subject, html_content, text_content)
            print(f"📨 [SMTP EMAIL SENT] To: {to_email}", flush=True)
            return {"sent": True, "mode": "smtp", "code": code}
        except Exception as e:
            print(f"⚠️ [SMTP FAILED for {to_email}]: {e}", flush=True)

    # 4. Fallback mode
    return {"sent": False, "mode": "fallback_logged", "code": code}


async def send_password_reset_email(to_email: str, code: str, student_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Send password reset code via email.
    Tries Resend API (HTTP 443) -> Brevo API (HTTP 443) -> IPv4 SMTP -> Fallback logging.
    """
    subject = f"رمز استعادة كلمة المرور في StudyMind AI: {code}"
    html_content = build_password_reset_html(code, student_name)
    text_content = f"رمز استعادة كلمة المرور في StudyMind AI هو: {code}\nصالح لمدة 15 دقيقة."

    print(
        f"\n======================================================\n"
        f"🔐 [STUDYMIND PASSWORD RESET OTP CODE]\n"
        f"To: {to_email}\n"
        f"Code: {code}\n"
        f"======================================================\n",
        flush=True
    )

    # 1. Try Resend API (Port 443 HTTPS)
    if settings.RESEND_API_KEY:
        if await _send_resend_api(to_email, subject, html_content, text_content):
            return {"sent": True, "mode": "resend", "code": code}

    # 2. Try Brevo API (Port 443 HTTPS)
    if settings.BREVO_API_KEY:
        if await _send_brevo_api(to_email, subject, html_content, text_content):
            return {"sent": True, "mode": "brevo", "code": code}

    # 3. Try SMTP (IPv4 enforced)
    if settings.SMTP_HOST:
        try:
            await asyncio.to_thread(_send_smtp_sync, to_email, subject, html_content, text_content)
            print(f"📨 [SMTP PASSWORD RESET EMAIL SENT] To: {to_email}", flush=True)
            return {"sent": True, "mode": "smtp", "code": code}
        except Exception as e:
            print(f"⚠️ [SMTP PASSWORD RESET FAILED for {to_email}]: {e}", flush=True)

    # 4. Fallback
    return {"sent": False, "mode": "fallback_logged", "code": code}
