import os
from typing import List, Optional
from pydantic import BaseModel, Field

from pathlib import Path

try:
    from dotenv import load_dotenv
    _backend_dir = Path(__file__).resolve().parent.parent.parent
    _backend_env = _backend_dir / ".env"
    if _backend_env.is_file():
        load_dotenv(dotenv_path=_backend_env, override=False)
    load_dotenv(override=False)
except ImportError:
    pass

class Settings(BaseModel):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Software Dependency Impact Analyzer")
    VERSION: str = os.getenv("VERSION", "0.1.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "127.0.0.1")

    # CORS
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")

    # Database
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL") or None
    DB_ECHO: bool = os.getenv("DB_ECHO", "False").lower() in ("true", "1")
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_POOL_TIMEOUT: float = float(os.getenv("DB_POOL_TIMEOUT", "30.0"))
    DB_CONNECT_TIMEOUT_SECONDS: float = float(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "3.0"))

    # OSV API
    OSV_API_BASE_URL: str = os.getenv("OSV_API_BASE_URL", "https://api.osv.dev/v1/query")
    OSV_TIMEOUT_SECONDS: float = float(os.getenv("OSV_TIMEOUT_SECONDS", "5.0"))

    # Public Demo Resource Limits
    MAX_REQUEST_BODY_SIZE_BYTES: int = int(os.getenv("MAX_REQUEST_BODY_SIZE_BYTES", str(2 * 1024 * 1024)))  # 2 MiB ceiling
    MAX_PACKAGE_COUNT: int = int(os.getenv("MAX_PACKAGE_COUNT", "400"))  # 400 package ceiling for free-tier memory safety
    MAX_DEPENDENCY_EDGES: int = int(os.getenv("MAX_DEPENDENCY_EDGES", "2000"))  # 2,000 edge ceiling to prevent dense graph lockup
    MAX_EXTERNAL_SCAN_PACKAGES: int = int(os.getenv("MAX_EXTERNAL_SCAN_PACKAGES", "75"))  # 75 packages max per OSV/npm query batch

    # Server-Side In-Memory Rate Limiting (per-minute limits)
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "True").lower() in ("true", "1")
    TRUST_PROXY_HEADERS: bool = os.getenv("TRUST_PROXY_HEADERS", "False").lower() in ("true", "1")
    RATE_LIMIT_ANALYZE: int = int(os.getenv("RATE_LIMIT_ANALYZE", "15"))
    RATE_LIMIT_SIMULATE: int = int(os.getenv("RATE_LIMIT_SIMULATE", "25"))
    RATE_LIMIT_SECURITY_SCAN: int = int(os.getenv("RATE_LIMIT_SECURITY_SCAN", "8"))
    RATE_LIMIT_FRESHNESS: int = int(os.getenv("RATE_LIMIT_FRESHNESS", "8"))
    RATE_LIMIT_PROJECTS_WRITE: int = int(os.getenv("RATE_LIMIT_PROJECTS_WRITE", "20"))
    RATE_LIMIT_RESTORE: int = int(os.getenv("RATE_LIMIT_RESTORE", "30"))

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
