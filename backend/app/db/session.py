import logging
from typing import Generator, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Base declarative class for all SQLAlchemy 2.0 ORM models
Base = declarative_base()

_engine = None
_session_factory = None

def get_engine(db_url: Optional[str] = None):
    """
    Initializes or returns the SQLAlchemy Engine.
    Ensures connection pooling for PostgreSQL.
    """
    global _engine, _session_factory
    url = db_url or settings.DATABASE_URL
    if not url:
        return None

    if _engine is None or db_url is not None or str(_engine.url) != url:
        if _engine is not None and db_url is None:
            try:
                _engine.dispose()
            except Exception:
                pass
        engine_kwargs = {
            "echo": settings.DB_ECHO,
            "future": True,
        }
        # Connection pooling configuration for network databases
        if url.startswith("postgresql"):
            engine_kwargs.update({
                "pool_size": settings.DB_POOL_SIZE,
                "max_overflow": settings.DB_MAX_OVERFLOW,
                "pool_timeout": settings.DB_POOL_TIMEOUT,
                "pool_pre_ping": True,  # Verifies connection liveness before checkout
            })

        eng = create_engine(url, **engine_kwargs)
        if db_url is None:
            _engine = eng
            _session_factory = sessionmaker(autocommit=False, autoflush=False, bind=_engine, future=True)
            return _engine
        return eng

    return _engine

def get_session_factory(db_url: Optional[str] = None):
    global _session_factory
    if _session_factory is None or db_url is not None:
        eng = get_engine(db_url)
        if eng is None:
            return None
        factory = sessionmaker(autocommit=False, autoflush=False, bind=eng, future=True)
        if db_url is None:
            _session_factory = factory
        return factory
    return _session_factory

def check_db_connection(db_url: Optional[str] = None) -> dict:
    """
    Tests whether the configured PostgreSQL database is reachable.
    Returns a dictionary with status, message, and details without leaking credentials.
    """
    url = settings.DATABASE_URL if db_url is None else db_url
    if not url or not url.strip():
        return {
            "connected": False,
            "status": "disabled",
            "message": "DATABASE_URL is not configured. Running in pure in-memory mode."
        }

    try:
        eng = get_engine(db_url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "connected": True,
            "status": "connected",
            "message": "PostgreSQL database connection established successfully."
        }
    except OperationalError as e:
        logger.warning(f"Database operational connection failure: {e}")
        return {
            "connected": False,
            "status": "unreachable",
            "message": "PostgreSQL database is currently unreachable. Check host, port, credentials, and service status."
        }
    except Exception as e:
        logger.error(f"Unexpected database error: {e}")
        return {
            "connected": False,
            "status": "error",
            "message": f"Database initialization error: {type(e).__name__}"
        }

def get_db() -> Generator[Optional[Session], None, None]:
    """
    FastAPI dependency yielding an isolated database session with automatic commit/rollback and cleanup.
    Yields None if the database is not configured or unreachable.
    """
    factory = get_session_factory()
    if factory is None:
        yield None
        return

    session: Session = factory()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
