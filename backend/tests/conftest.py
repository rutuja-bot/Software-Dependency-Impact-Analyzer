import os
import sys
import pytest

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings

@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """
    Ensures unit test runs do not hang on external network resources or local PostgreSQL
    unless explicitly configured via environment variable (TEST_USE_REAL_POSTGRES=1).
    """
    if os.getenv("TEST_USE_REAL_POSTGRES") != "1":
        monkeypatch.setattr(settings, "DATABASE_URL", None)
