import os
from typing import List, Optional
from pydantic import BaseModel, Field

from pathlib import Path

try:
    from dotenv import load_dotenv
    _backend_dir = Path(__file__).resolve().parent.parent.parent
    _backend_env = _backend_dir / ".env"
    if _backend_env.is_file():
        load_dotenv(dotenv_path=_backend_env, override=True)
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
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dependency_analyzer")
    DB_ECHO: bool = os.getenv("DB_ECHO", "False").lower() in ("true", "1")
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_POOL_TIMEOUT: float = float(os.getenv("DB_POOL_TIMEOUT", "30.0"))

    # OSV API
    OSV_API_BASE_URL: str = os.getenv("OSV_API_BASE_URL", "https://api.osv.dev/v1/query")
    OSV_TIMEOUT_SECONDS: float = float(os.getenv("OSV_TIMEOUT_SECONDS", "5.0"))

    # Max upload limit (in bytes) - default 10MB
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

settings = Settings()
