import asyncio
import logging
import secrets
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Dict, Any

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


def _send_smtp_sync(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """Synchronous worker function to send email via SMTP."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"StudyMind AI <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    if settings.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        if settings.SMTP_TLS:
            server.starttls()

    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

    server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
    server.quit()
    return True


async def send_verification_email(to_email: str, code: str, student_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Send OTP verification email.
    If SMTP_HOST is not configured, logs code to server terminal safely and operates in hybrid mode.
    """
    subject = f"رمز التحقق الخاص بك في StudyMind AI: {code}"
    html_content = build_verification_html(code, student_name)
    text_content = f"رمز التحقق الخاص بك في StudyMind AI هو: {code}\nصالح لمدة 15 دقيقة."

    # If SMTP is configured, attempt real email delivery
    if settings.SMTP_HOST:
        try:
            await asyncio.to_thread(_send_smtp_sync, to_email, subject, html_content, text_content)
            logger.info(f"Verification email successfully sent to {to_email}")
            return {"sent": True, "mode": "smtp", "code": None}
        except Exception as e:
            logger.error(f"Failed to send email via SMTP to {to_email}: {e}")
            # Fallback to logging code in server logs so student isn't permanently locked out
            logger.warning(
                f"\n======================================================\n"
                f"🔐 [STUDYMIND SECURITY OTP FALLBACK]\n"
                f"To: {to_email}\n"
                f"Code: {code}\n"
                f"======================================================\n"
            )
            return {"sent": False, "mode": "fallback_logged", "code": code}
    else:
        # Dev / Simulation mode
        logger.warning(
            f"\n======================================================\n"
            f"📧 [STUDYMIND OTP DEV MODE - No SMTP configured]\n"
            f"To: {to_email}\n"
            f"Code: {code}\n"
            f"======================================================\n"
        )
        return {"sent": False, "mode": "simulated", "code": code}


async def send_password_reset_email(to_email: str, code: str, student_name: Optional[str] = None) -> Dict[str, Any]:
    """Send password reset code via email."""
    subject = f"رمز استعادة كلمة المرور في StudyMind AI: {code}"
    html_content = build_password_reset_html(code, student_name)
    text_content = f"رمز استعادة كلمة المرور في StudyMind AI هو: {code}\nصالح لمدة 15 دقيقة."

    if settings.SMTP_HOST:
        try:
            await asyncio.to_thread(_send_smtp_sync, to_email, subject, html_content, text_content)
            logger.info(f"Password reset email sent to {to_email}")
            return {"sent": True, "mode": "smtp", "code": None}
        except Exception as e:
            logger.error(f"Failed to send password reset email to {to_email}: {e}")
            logger.warning(
                f"\n======================================================\n"
                f"🔐 [STUDYMIND PASSWORD RESET OTP FALLBACK]\n"
                f"To: {to_email}\n"
                f"Code: {code}\n"
                f"======================================================\n"
            )
            return {"sent": False, "mode": "fallback_logged", "code": code}
    else:
        logger.warning(
            f"\n======================================================\n"
            f"📧 [STUDYMIND PASSWORD RESET DEV MODE]\n"
            f"To: {to_email}\n"
            f"Code: {code}\n"
            f"======================================================\n"
        )
        return {"sent": False, "mode": "simulated", "code": code}
