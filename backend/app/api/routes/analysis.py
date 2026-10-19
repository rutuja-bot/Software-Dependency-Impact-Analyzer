import datetime
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.schemas.graph import (
    HealthResponse,
    InfoResponse,
    ProjectManifestInput,
    GraphAnalysisResponse,
    DownstreamImpactResponse
)
from app.parsers.nodejs import NodeJsManifestParser
from app.services.graph_service import DependencyGraphService
from app.core.config import settings
from app.db.session import get_db, check_db_connection
from app.db.repository import ProjectRepository

logger = logging.getLogger(__name__)

router = APIRouter()
graph_service = DependencyGraphService()

# In-memory session cache for the active parsed graph to allow subsequent impact queries
_ACTIVE_GRAPH_CACHE: Dict[str, Any] = {}

def get_optional_repo(db: Optional[Session] = Depends(get_db)) -> Optional[ProjectRepository]:
    if db is None:
        return None
    return ProjectRepository(db)

@router.get("/health", response_model=HealthResponse, summary="Service health check")
async def health_check():
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        project=settings.PROJECT_NAME,
        timestamp=datetime.datetime.utcnow().isoformat()
    )

@router.get("/info", response_model=InfoResponse, summary="Application and ecosystem metadata")
async def app_info():
    db_health = check_db_connection()
    return InfoResponse(
        project_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Analyzes software dependencies as directed graphs to evaluate blast radius, circular loops, and downstream change impact.",
        supported_ecosystems=["Node.js (npm)"],
        supported_lockfile_versions=[1, 2, 3],
        edge_convention="A -> B strictly means: 'Package A depends on Package B'",
        implemented_features=[
            "package.json manifest parsing",
            "package-lock.json v1, v2, v3 lockfile parsing",
            "Directed Dependency Graph (NetworkX DiGraph)",
            "Direct and Transitive dependency classification",
            "Circular Dependency Detection (Simple Cycles / Tarjan SCC)",
            "Topological Sorting for DAG evaluation",
            "Downstream Reverse Dependency Impact Analysis (BFS Shortest Path)",
            "Interactive Cytoscape.js Graph Visualization payload formatting",
            "In-memory 'What-If' dependency mutation simulation (add/update/remove)",
            "OSV REST API Vulnerability cross-referencing",
            "LibYear dependency freshness and lag scoring",
            "PostgreSQL persistence with SQLAlchemy 2.0 & Alembic migrations"
        ],
        planned_features=[
            "Automated multi-repository git webhook integration"
        ]
    )

@router.post("/analyze", response_model=GraphAnalysisResponse, summary="Analyze JSON manifest payload")
async def analyze_project_manifest(
    payload: ProjectManifestInput,
    repo: Optional[ProjectRepository] = Depends(get_optional_repo)
):
    try:
        manifest = NodeJsManifestParser.parse_package_json(payload.package_json)
        if payload.package_lock_json:
            manifest = NodeJsManifestParser.parse_package_lock(payload.package_lock_json, manifest)

        # Build NetworkX Graph
        G = graph_service.build_graph(manifest)
        analysis = graph_service.analyze_graph(G, manifest.name, manifest.version)

        # Cache active graph in-memory
        _ACTIVE_GRAPH_CACHE["latest"] = {
            "graph": G,
            "project_name": manifest.name,
            "analysis_id": None
        }

        # If database repository is available, automatically persist project & analysis run
        if repo:
            try:
                project = repo.get_or_create_project(name=manifest.name, ecosystem="npm")
                direct_count = sum(1 for d in manifest.dependencies.values() if d.is_direct and not d.is_dev)
                dev_count = sum(1 for d in manifest.dependencies.values() if d.is_dev)
                manifest_meta = {
                    "package_name": manifest.name,
                    "has_lockfile": bool(payload.package_lock_json),
                    "direct_count": direct_count,
                    "dev_count": dev_count
                }
                analysis_record = repo.record_analysis_run(
                    project=project,
                    analysis_data=analysis,
                    manifest_metadata=manifest_meta,
                    status="completed"
                )
                _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"] = analysis_record.id
                _ACTIVE_GRAPH_CACHE["latest"]["project_id"] = project.id
            except Exception as db_err:
                logger.warning(f"Database persistence skipped during analysis: {db_err}")

        return analysis
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph analysis error: {str(e)}")


def restore_graph_from_snapshot(analysis) -> Dict[str, Any]:
    """Reconstructs NetworkX DiGraph from a stored graph snapshot and activates it in cache."""
    import networkx as nx
    G = nx.DiGraph()
    snapshot = analysis.graph_snapshot
    root_pkg = None

    for node in snapshot.nodes:
        node_id = node.get("id") or node.get("name")
        if node.get("is_root"):
            root_pkg = node_id
        G.add_node(node_id, **node)

    for edge in snapshot.edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src and tgt:
            G.add_edge(src, tgt, **edge)

    if not root_pkg:
        root_pkg = analysis.project.name if analysis.project else (snapshot.nodes[0].get("name") if snapshot.nodes else "root")

    active_entry = {
        "graph": G,
        "project_name": root_pkg,
        "analysis_id": analysis.id,
        "project_id": analysis.project_id
    }
    _ACTIVE_GRAPH_CACHE["latest"] = active_entry
    return active_entry


@router.get("/impact", response_model=DownstreamImpactResponse, summary="Calculate downstream packages affected by a target package")
async def get_downstream_impact(
    target_package: str = Query(..., description="Package name to evaluate blast radius for"),
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to evaluate against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo)
):
    cached = _ACTIVE_GRAPH_CACHE.get("latest")

    # If an explicit analysis_id is provided, verify match or restore snapshot from repository
    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Analysis run '{analysis_id}' with stored graph snapshot not found."
                    )
                cached = restore_graph_from_snapshot(analysis)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet. Please submit a manifest to /api/analyze first."
        )

    G = cached["graph"]
    impact = graph_service.find_affected_downstream_packages(G, target_package)
    return impact

from app.schemas.simulation import SimulationRequest, SimulationResponse
from app.services.simulation_service import DependencySimulationService

simulation_service = DependencySimulationService(graph_service)

@router.post("/simulate", response_model=SimulationResponse, summary="Simulate adding, removing, or upgrading dependencies on an isolated copy")
async def simulate_dependency_change(
    request: SimulationRequest,
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to simulate against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo)
):
    cached = _ACTIVE_GRAPH_CACHE.get("latest")

    # If an explicit analysis_id is provided, verify match or restore snapshot from repository
    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Analysis run '{analysis_id}' with stored graph snapshot not found."
                    )
                cached = restore_graph_from_snapshot(analysis)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet. Please submit a manifest to /api/analyze before running simulations."
        )

    baseline_graph = cached["graph"]
    root_pkg = cached["project_name"]

    try:
        response = simulation_service.simulate(
            baseline_graph=baseline_graph,
            root_package=root_pkg,
            request=request
        )

        # If database persistence is active, persist the simulation run under baseline analysis
        if repo and cached.get("project_id") and cached.get("analysis_id"):
            try:
                repo.record_simulation_run(
                    project_id=cached["project_id"],
                    baseline_analysis_id=cached["analysis_id"],
                    sim_res=response
                )
            except Exception as db_err:
                logger.warning(f"Database persistence skipped for simulation: {db_err}")

        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

from app.schemas.security import SecurityScanResponse, FreshnessAnalysisResponse
from app.security.osv_service import OsvSecurityService
from app.analyzers.freshness_service import LibYearFreshnessService

osv_service = OsvSecurityService()
freshness_service = LibYearFreshnessService()

@router.post("/security/scan", response_model=SecurityScanResponse, summary="Scan active project dependencies against the OSV API")
async def scan_project_security(
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to scan against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo)
):
    cached = _ACTIVE_GRAPH_CACHE.get("latest")

    # If an explicit analysis_id is provided, verify match or restore snapshot from repository
    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Analysis run '{analysis_id}' with stored graph snapshot not found."
                    )
                cached = restore_graph_from_snapshot(analysis)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet. Please submit a manifest to /api/analyze before scanning."
        )

    G = cached["graph"]
    root_pkg = cached["project_name"]

    packages_to_scan = []
    for node, data in G.nodes(data=True):
        if node == root_pkg:
            continue
        packages_to_scan.append({
            "name": node,
            "version": data.get("version")
        })

    import anyio
    result = await anyio.to_thread.run_sync(osv_service.scan_packages, packages_to_scan)

    # Persist security scan findings if DB is connected and active analysis exists
    target_analysis_id = analysis_id or cached.get("analysis_id")
    if repo and target_analysis_id:
        try:
            repo.record_security_scan(target_analysis_id, result)
        except Exception as db_err:
            logger.warning(f"Database persistence skipped for security scan: {db_err}")

    return result

@router.post("/freshness/analyze", response_model=FreshnessAnalysisResponse, summary="Calculate LibYear freshness scores for active project dependencies")
async def analyze_project_freshness(
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to analyze against"),
    retry_failed: bool = Query(False, description="Retry package lookups that previously failed or timed out"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo)
):
    cached = _ACTIVE_GRAPH_CACHE.get("latest")

    # If an explicit analysis_id is provided, verify match or restore snapshot from repository
    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Analysis run '{analysis_id}' with stored graph snapshot not found."
                    )
                cached = restore_graph_from_snapshot(analysis)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet. Please submit a manifest to /api/analyze before checking freshness."
        )

    G = cached["graph"]
    root_pkg = cached["project_name"]

    packages_to_score = []
    for node, data in G.nodes(data=True):
        if node == root_pkg:
            continue
        packages_to_score.append({
            "name": node,
            "version": data.get("version")
        })

    import anyio
    import functools
    analyze_fn = functools.partial(freshness_service.analyze_freshness, packages_to_score, retry_failed=retry_failed)
    result = await anyio.to_thread.run_sync(analyze_fn)

    # Persist freshness records if DB is connected and active analysis exists
    target_analysis_id = analysis_id or cached.get("analysis_id")
    if repo and target_analysis_id:
        try:
            repo.record_freshness_analysis(target_analysis_id, result)
        except Exception as db_err:
            logger.warning(f"Database persistence skipped for freshness: {db_err}")

    return result


