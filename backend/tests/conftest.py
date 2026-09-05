import pytest
from app.core.rate_limiter import rate_limiter

@pytest.fixture(autouse=True)
def reset_rate_limiter_fixture():
    """Ensures each test function starts with a clean rate limiter state."""
    rate_limiter.reset()
    yield
    rate_limiter.reset()
