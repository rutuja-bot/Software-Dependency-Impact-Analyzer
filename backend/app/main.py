from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.routes.analysis import router as analysis_router
from app.api.routes.projects import router as projects_router
from app.api.routes.analyses import router as analyses_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Software Dependency Impact Analyzer - Graph-based Dependency Analysis Engine",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Centralized exception handler for unhandled non-HTTP exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    # Hide internal traceback for unhandled generic exceptions
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
