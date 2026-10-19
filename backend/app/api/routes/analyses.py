import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.repository import ProjectRepository
from app.schemas.project import (
    AnalysisDetailResponse,
    GraphSnapshotResponse,
    StoredSecurityResponse,
    StoredVulnerabilityFinding,
    StoredFreshnessResponse,
    StoredFreshnessRecord,
    SimulationRunResponse
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


@router.get("/{analysis_id}", response_model=AnalysisDetailResponse, summary="Get full analysis details and snapshot")
async def get_analysis_detail(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")

    snapshot_resp = None
    if analysis.graph_snapshot:
        snapshot_resp = GraphSnapshotResponse(
            id=analysis.graph_snapshot.id,
            analysis_id=analysis.id,
            nodes=analysis.graph_snapshot.nodes,
            edges=analysis.graph_snapshot.edges,
            created_at=analysis.graph_snapshot.created_at
        )

    project_name = None
    if analysis.project:
        project_name = analysis.project.name
    elif analysis.manifest_metadata and isinstance(analysis.manifest_metadata, dict):
        project_name = analysis.manifest_metadata.get("package_name")

    return AnalysisDetailResponse(
        id=analysis.id,
        project_id=analysis.project_id,
        project_name=project_name,
        project_version=analysis.project_version,
        status=analysis.status,
        total_packages=analysis.total_packages,
        direct_dependencies_count=analysis.direct_dependencies_count,
        transitive_dependencies_count=analysis.transitive_dependencies_count,
        total_dependency_edges=analysis.total_dependency_edges,
        has_cycles=analysis.has_cycles,
        cycle_count=analysis.cycle_count,
        is_dag=analysis.is_dag,
        topological_order=analysis.topological_order,
        cycle_details=analysis.cycle_details,
        manifest_metadata=analysis.manifest_metadata,
        error_summary=analysis.error_summary,
        created_at=analysis.created_at,
        graph_snapshot=snapshot_resp
    )


@router.get("/{analysis_id}/snapshot", response_model=GraphSnapshotResponse, summary="Retrieve graph snapshot for an analysis")
async def get_analysis_snapshot(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")
    if not analysis.graph_snapshot:
        raise HTTPException(status_code=404, detail=f"No graph snapshot stored for analysis '{analysis_id}'.")

    return GraphSnapshotResponse(
        id=analysis.graph_snapshot.id,
        analysis_id=analysis.id,
        nodes=analysis.graph_snapshot.nodes,
        edges=analysis.graph_snapshot.edges,
        created_at=analysis.graph_snapshot.created_at
    )


@router.post("/{analysis_id}/restore", summary="Restore historical analysis snapshot into active memory cache")
async def restore_analysis_snapshot(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")
    if not analysis.graph_snapshot:
        raise HTTPException(status_code=404, detail=f"No graph snapshot stored for analysis '{analysis_id}'.")

    from app.api.routes.analysis import restore_graph_from_snapshot
    active_entry = restore_graph_from_snapshot(analysis)

    return {
        "status": "restored",
        "analysis_id": analysis.id,
        "project_id": analysis.project_id,
        "project_name": active_entry["project_name"]
    }


@router.get("/{analysis_id}/security", response_model=StoredSecurityResponse, summary="Retrieve persisted security findings for an analysis")
async def get_analysis_security(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")

    findings = repo.get_security_findings_for_analysis(analysis_id)
    vulnerable_pkgs = set(f.package_name for f in findings if f.scan_status == "vulnerable")

    return StoredSecurityResponse(
        analysis_id=analysis_id,
        total_findings=len(findings),
        vulnerable_packages_count=len(vulnerable_pkgs),
        findings=[
            StoredVulnerabilityFinding(
                id=f.id,
                analysis_id=f.analysis_id,
                package_name=f.package_name,
                package_version=f.package_version,
                vuln_id=f.vuln_id,
                summary=f.summary,
                details=f.details,
                severity=f.severity,
                fixed_versions=f.fixed_versions,
                references=f.references,
                scan_status=f.scan_status,
                created_at=f.created_at
            )
            for f in findings
        ]
    )


@router.get("/{analysis_id}/freshness", response_model=StoredFreshnessResponse, summary="Retrieve persisted freshness records for an analysis")
async def get_analysis_freshness(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")

    records = repo.get_freshness_records_for_analysis(analysis_id)
    scored = [r for r in records if r.status == "scored"]
    unscored = [r for r in records if r.status != "scored"]

    tot = records[0].project_total_libyear if records else None
    avg = records[0].project_average_libyear if records else None

    return StoredFreshnessResponse(
        analysis_id=analysis_id,
        total_packages=len(records),
        scored_packages_count=len(scored),
        unscored_packages_count=len(unscored),
        project_total_libyear=tot,
        project_average_libyear=avg,
        records=[
            StoredFreshnessRecord(
                id=r.id,
                analysis_id=r.analysis_id,
                package_name=r.package_name,
                installed_version=r.installed_version,
                release_date=r.release_date,
                libyear=r.libyear,
                status=r.status,
                reason_unscored=r.reason_unscored,
                created_at=r.created_at
            )
            for r in records
        ]
    )


@router.get("/{analysis_id}/simulations", response_model=List[SimulationRunResponse], summary="List simulations performed against an analysis")
async def get_analysis_simulations(
    analysis_id: str = Path(..., description="Analysis Run UUID"),
    repo: ProjectRepository = Depends(require_repo)
):
    analysis = repo.get_analysis_by_id(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail=f"Analysis run with ID '{analysis_id}' not found.")

    sims = repo.list_simulations_for_analysis(analysis_id)
    return sims
