import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy.orm import Session

from app.db.session import get_db, check_db_connection
from app.db.repository import ProjectRepository
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    AnalysisHistoryItem,
    AnalysisDetailResponse,
    GraphSnapshotResponse,
    StoredSecurityResponse,
    StoredFreshnessResponse,
    SimulationRunResponse,
    DatabaseStatusResponse
)

logger = logging.getLogger(__name__)
router = APIRouter()

def get_repo(db: Optional[Session] = Depends(get_db)) -> Optional[ProjectRepository]:
    if db is None:
        return None
    return ProjectRepository(db)

def require_repo(repo: Optional[ProjectRepository] = Depends(get_repo)) -> ProjectRepository:
    if repo is None:
        raise HTTPException(
            status_code=503,
            detail="Database persistence is not available. Please verify DATABASE_URL and PostgreSQL connection."
        )
    return repo


@router.get("/status", response_model=DatabaseStatusResponse, summary="Check database persistence and connection status")
async def get_database_status(db: Optional[Session] = Depends(get_db)):
    health = check_db_connection()
    if not health.get("connected") or db is None:
        return DatabaseStatusResponse(
            connected=False,
            status=health.get("status", "unreachable"),
            message=health.get("message", "Database not connected.")
        )
    
    try:
        repo = ProjectRepository(db)
        return DatabaseStatusResponse(
            connected=True,
            status="connected",
            message="PostgreSQL database connected and operational.",
            total_projects=repo.count_projects(),
            total_analyses=repo.count_analyses(),
            total_simulations=repo.count_simulations()
        )
    except Exception as e:
        logger.warning(f"Error querying project statistics: {e}")
        return DatabaseStatusResponse(
            connected=True,
            status="connected",
            message="PostgreSQL database connected and operational.",
            total_projects=0,
            total_analyses=0,
            total_simulations=0
        )


@router.post("", response_model=ProjectResponse, summary="Create or register a project")
async def create_project(payload: ProjectCreate, repo: ProjectRepository = Depends(require_repo)):
    project = repo.get_or_create_project(
        name=payload.name,
        ecosystem=payload.ecosystem,
        description=payload.description
    )
    return ProjectResponse(
        id=project.id,
        name=project.name,
        ecosystem=project.ecosystem,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        analysis_count=len(project.analyses),
        simulation_count=len(project.simulations)
    )


@router.get("", response_model=List[ProjectResponse], summary="List registered projects")
async def list_projects(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    repo: ProjectRepository = Depends(require_repo)
):
    projects = repo.list_projects(limit=limit, offset=offset)
    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            ecosystem=p.ecosystem,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            analysis_count=len(p.analyses),
            simulation_count=len(p.simulations)
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectResponse, summary="Get project details")
async def get_project(
    project_id: str = Path(..., description="Project UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    project = repo.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found.")
    return ProjectResponse(
        id=project.id,
        name=project.name,
        ecosystem=project.ecosystem,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        analysis_count=len(project.analyses),
        simulation_count=len(project.simulations)
    )


@router.get("/{project_id}/analyses", response_model=List[AnalysisHistoryItem], summary="List analysis history for a project")
async def list_project_analyses(
    project_id: str = Path(..., description="Project UUID"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    repo: ProjectRepository = Depends(require_repo)
):
    project = repo.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found.")
    
    analyses = repo.list_analyses_for_project(project_id, limit=limit, offset=offset)
    return analyses


@router.get("/{project_id}/simulations", response_model=List[SimulationRunResponse], summary="List simulation runs for a project")
async def list_project_simulations(
    project_id: str = Path(..., description="Project UUID"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    repo: ProjectRepository = Depends(require_repo)
):
    project = repo.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found.")

    sims = repo.list_simulations_for_project(project_id, limit=limit, offset=offset)
    return sims
