import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.routes.analysis import router as analysis_router
from app.api.routes.projects import router as projects_router
from app.api.routes.analyses import router as analyses_router

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Enforces that production mode requires a verified active PostgreSQL connection.
    In-memory fallback is strictly disallowed in production.
    """
    if getattr(settings, "ENVIRONMENT", "").lower() == "production":
        from app.db.session import check_db_connection
        status = check_db_connection()
        if not status.get("connected"):
            raise RuntimeError(
                f"Production startup failed: PostgreSQL database is unreachable ({status.get('message')}). "
                "In-memory fallback is disabled in production."
            )
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Software Dependency Impact Analyzer - Graph-based Dependency Analysis Engine",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request payload size guard middleware
@app.middleware("http")
async def enforce_request_size_limit(request: Request, call_next):
    """
    Enforces maximum request payload size before buffering into memory.
    Returns HTTP 413 Payload Too Large if Content-Length exceeds configured limit.
    """
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
            if length > settings.MAX_REQUEST_BODY_SIZE_BYTES:
                limit_mb = max(1, settings.MAX_REQUEST_BODY_SIZE_BYTES // (1024 * 1024))
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": f"Payload too large ({length} bytes). Maximum allowed request size is {limit_mb} MiB."
                    }
                )
        except ValueError:
            pass
    return await call_next(request)

# Centralized exception handler for unhandled non-HTTP exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    # Hide internal traceback from client while recording full diagnostics in server logs
    logger.error(
        "Unhandled exception processing %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"An internal server error occurred while processing the request: {type(exc).__name__}"}
    )

# Include API Routers
app.include_router(analysis_router, prefix="/api", tags=["Analysis"])
app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(analyses_router, prefix="/api/analyses", tags=["Analyses"])

@app.get("/")
def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "docs": "/docs",
        "health": "/api/health",
        "info": "/api/info"
    }
# Auto-reload trigger
