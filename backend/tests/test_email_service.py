import pytest
from unittest.mock import patch, AsyncMock
from app.services.email_service import _resolve_ipv4, send_verification_email, send_password_reset_email
from app.core.config import settings

@pytest.mark.asyncio
async def test_resolve_ipv4():
    ip = _resolve_ipv4('smtp.gmail.com', 587)
    assert isinstance(ip, str)
    assert len(ip) > 0

@pytest.mark.asyncio
async def test_email_fallback_when_no_credentials():
    with patch.object(settings, 'RESEND_API_KEY', ''):
        with patch.object(settings, 'BREVO_API_KEY', ''):
            with patch.object(settings, 'SMTP_HOST', ''):
                res = await send_verification_email('student@example.com', '123456', 'Ahmed')
                assert res['sent'] is False
                assert res['mode'] == 'fallback_logged'
                assert res['code'] == '123456'

@pytest.mark.asyncio
async def test_email_via_resend_mock():
    with patch.object(settings, 'RESEND_API_KEY', 're_mock_12345'):
        with patch('app.services.email_service._send_resend_api', new_callable=AsyncMock) as mock_resend:
            mock_resend.return_value = True
            res = await send_verification_email('student@example.com', '999888', 'Sarah')
            assert res['sent'] is True
            assert res['mode'] == 'resend'
            assert res['code'] == '999888'
