import datetime
import logging
import threading
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends, Header, Request
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
from app.core.rate_limiter import limiter
from app.db.session import get_db, check_db_connection
from app.db.repository import ProjectRepository

logger = logging.getLogger(__name__)

router = APIRouter()
graph_service = DependencyGraphService()

# In-memory session cache for active parsed graphs with bounded capacity
_ACTIVE_GRAPH_CACHE: Dict[str, Any] = {}
_CACHE_LOCK = threading.Lock()
MAX_ACTIVE_GRAPH_CACHE_SIZE = 50

def resolve_session_key(request: Request, x_session_id: Optional[str] = None) -> str:
    """Returns explicit session ID header or falls back to client IP partitioning."""
    if x_session_id and x_session_id.strip():
        return x_session_id.strip()
    return f"ip_{limiter.extract_client_ip(request)}"

def store_active_graph(entry: Dict[str, Any], session_id: Optional[str] = None) -> None:
    """
    Stores active graph under analysis_id and session_id with thread-safe lock protection.
    Unsafe global cross-user overwrite is eliminated.
    """
    with _CACHE_LOCK:
        analysis_id = entry.get("analysis_id")
        if analysis_id:
            _ACTIVE_GRAPH_CACHE[str(analysis_id)] = entry
        if session_id:
            _ACTIVE_GRAPH_CACHE[str(session_id)] = entry
        # Store under 'latest' only in development mode for backward compatibility
        if getattr(settings, "ENVIRONMENT", "").lower() != "production":
            _ACTIVE_GRAPH_CACHE["latest"] = entry

        # Prune oldest entries if cache exceeds ceiling
        if len(_ACTIVE_GRAPH_CACHE) > MAX_ACTIVE_GRAPH_CACHE_SIZE:
            keys = list(_ACTIVE_GRAPH_CACHE.keys())[:-25]
            for k in keys:
                _ACTIVE_GRAPH_CACHE.pop(k, None)

def get_active_graph(analysis_id: Optional[str] = None, session_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieves active graph matching the caller's analysis_id or session_id.
    Prevents cross-session state leakage.
    """
    with _CACHE_LOCK:
        if analysis_id and str(analysis_id) in _ACTIVE_GRAPH_CACHE:
            return _ACTIVE_GRAPH_CACHE[str(analysis_id)]
        if session_id and str(session_id) in _ACTIVE_GRAPH_CACHE:
            return _ACTIVE_GRAPH_CACHE[str(session_id)]
        # Development / test fallback only
        if getattr(settings, "ENVIRONMENT", "").lower() != "production":
            return _ACTIVE_GRAPH_CACHE.get("latest")
        return None

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
    request: Request,
    payload: ProjectManifestInput,
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    limiter.check_rate_limit(request, "analyze", settings.RATE_LIMIT_ANALYZE)
    session_key = resolve_session_key(request, x_session_id)
    try:
        manifest = NodeJsManifestParser.parse_package_json(payload.package_json)
        if payload.package_lock_json:
            manifest = NodeJsManifestParser.parse_package_lock(payload.package_lock_json, manifest)

        # Build NetworkX Graph
        G = graph_service.build_graph(manifest)
        analysis = graph_service.analyze_graph(G, manifest.name, manifest.version)

        # Cache active graph in-memory (session-isolated & latest)
        active_entry = {
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
                active_entry["analysis_id"] = analysis_record.id
                active_entry["project_id"] = project.id
            except Exception as db_err:
                logger.warning(f"Database persistence skipped during analysis: {db_err}")

        store_active_graph(active_entry, session_id=session_key)
        return analysis
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected graph analysis failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while analyzing the dependency graph. Diagnostic details have been logged."
        )


def restore_graph_from_snapshot(analysis, session_id: Optional[str] = None) -> Dict[str, Any]:
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
    store_active_graph(active_entry, session_id=session_id)
    return active_entry


@router.get("/impact", response_model=DownstreamImpactResponse, summary="Calculate downstream packages affected by a target package")
async def get_downstream_impact(
    request: Request,
    target_package: str = Query(..., description="Package name to evaluate blast radius for"),
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to evaluate against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

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
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet for this session. Please submit a manifest to /api/analyze first or provide analysis_id."
        )

    G = cached["graph"]
    impact = graph_service.find_affected_downstream_packages(G, target_package)
    return impact

from app.schemas.simulation import SimulationRequest, SimulationResponse
from app.services.simulation_service import DependencySimulationService

simulation_service = DependencySimulationService(graph_service)

@router.post("/simulate", response_model=SimulationResponse, summary="Simulate adding, removing, or upgrading dependencies on an isolated copy")
async def simulate_dependency_change(
    request: Request,
    sim_request: SimulationRequest,
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to simulate against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    limiter.check_rate_limit(request, "simulate", settings.RATE_LIMIT_SIMULATE)
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

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
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet for this session. Please submit a manifest to /api/analyze before running simulations."
        )

    baseline_graph = cached["graph"]
    root_pkg = cached["project_name"]

    try:
        response = simulation_service.simulate(
            baseline_graph=baseline_graph,
            root_package=root_pkg,
            request=sim_request
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected simulation failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while calculating the simulation diff. Diagnostic details have been logged."
        )

from app.schemas.security import SecurityScanResponse, FreshnessAnalysisResponse
from app.security.osv_service import OsvSecurityService
from app.analyzers.freshness_service import LibYearFreshnessService

osv_service = OsvSecurityService()
freshness_service = LibYearFreshnessService()

@router.post("/security/scan", response_model=SecurityScanResponse, summary="Scan active project dependencies against the OSV API")
async def scan_project_security(
    request: Request,
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to scan against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    limiter.check_rate_limit(request, "security_scan", settings.RATE_LIMIT_SECURITY_SCAN)
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

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
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet for this session. Please submit a manifest to /api/analyze before scanning."
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
    request: Request,
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to analyze against"),
    retry_failed: bool = Query(False, description="Retry package lookups that previously failed or timed out"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    limiter.check_rate_limit(request, "freshness", settings.RATE_LIMIT_FRESHNESS)
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

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
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Active in-memory analysis does not match requested analysis ID '{analysis_id}'."
                )

    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No active project graph analyzed yet for this session. Please submit a manifest to /api/analyze before checking freshness."
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


# =========================================================================
# MULTI-SOURCE PROJECT IMPORT ENDPOINTS
# =========================================================================

from app.schemas.import_project import (
    GitHubImportRequest,
    GitHubRepoInfoRequest,
    GitHubRepoInfoResponse
)
from app.services.import_service import ProjectImportService

import_service = ProjectImportService(graph_service)

@router.post("/import/github", response_model=GraphAnalysisResponse, summary="Import project directly from a GitHub repository")
async def import_github_repository(
    request: Request,
    payload: GitHubImportRequest,
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Imports a software project from a GitHub repository URL:
    1. Validates repository URL and checks for SSRF / domain spoofing.
    2. Retrieves package.json and optional package-lock.json via GitHub API.
    3. Builds directed dependency graph and executes graph analysis.
    4. Persists project metadata, commit SHA, and analysis run in PostgreSQL.
    """
    session_key = resolve_session_key(request, x_session_id)
    try:
        owner, repo_name, branch_from_url = import_service.parse_github_url(payload.repo_url)
        target_branch = payload.branch or branch_from_url

        pkg_json, pkg_lock, resolved_branch, commit_sha = import_service.fetch_github_manifests(
            owner=owner,
            repo=repo_name,
            branch=target_branch,
            auth_token=payload.auth_token
        )

        analysis_res = import_service.execute_import_pipeline(
            package_json=pkg_json,
            package_lock_json=pkg_lock,
            import_source="github",
            repository_url=payload.repo_url,
            branch_name=resolved_branch,
            commit_sha=commit_sha,
            repo=repo if payload.persist else None,
            session_id=session_key
        )

        # Reconstruct NetworkX DiGraph and store in active session cache
        norm_manifest = NodeJsManifestParser.parse_package_json(pkg_json)
        if pkg_lock:
            norm_manifest = NodeJsManifestParser.parse_package_lock(pkg_lock, norm_manifest)
        G = graph_service.build_graph(norm_manifest)

        active_entry = {
            "graph": G,
            "project_name": norm_manifest.name,
            "project_version": norm_manifest.version,
            "analysis_id": analysis_res.analysis_id,
            "project_id": getattr(analysis_res, "project_id", None)
        }
        store_active_graph(active_entry, session_id=session_key)

        return analysis_res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GitHub import failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while importing GitHub repository: {str(e)}"
        )


@router.post("/import/repo-info", response_model=GitHubRepoInfoResponse, summary="Inspect GitHub repository metadata and manifest existence")
async def get_github_repo_info(payload: GitHubRepoInfoRequest):
    """
    Retrieves public or authenticated GitHub repository information and checks
    whether required dependency manifests (package.json, package-lock.json) are present.
    """
    try:
        owner, repo_name, _ = import_service.parse_github_url(payload.repo_url)
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SoftwareDependencyImpactAnalyzer/1.0"
        }
        if payload.auth_token and payload.auth_token.strip():
            headers["Authorization"] = f"Bearer {payload.auth_token.strip()}"

        import requests
        repo_url = f"https://api.github.com/repos/{owner}/{repo_name}"
        r = requests.get(repo_url, headers=headers, timeout=10.0)
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Repository '{owner}/{repo_name}' not found.")
        elif r.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub authentication failed. Check your access token.")
        elif r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=f"GitHub API error: {r.text}")

        data = r.json()
        default_branch = data.get("default_branch", "main")

        # Check for package.json
        pkg_check = requests.get(
            f"https://api.github.com/repos/{owner}/{repo_name}/contents/package.json?ref={default_branch}",
            headers=headers,
            timeout=10.0
        )
        has_pkg = pkg_check.status_code == 200

        # Check for package-lock.json
        lock_check = requests.get(
            f"https://api.github.com/repos/{owner}/{repo_name}/contents/package-lock.json?ref={default_branch}",
            headers=headers,
            timeout=10.0
        )
        has_lock = lock_check.status_code == 200

        # Get latest commit
        commit_sha = None
        commit_check = requests.get(
            f"https://api.github.com/repos/{owner}/{repo_name}/commits/{default_branch}",
            headers=headers,
            timeout=10.0
        )
        if commit_check.status_code == 200:
            commit_sha = commit_check.json().get("sha")

        return GitHubRepoInfoResponse(
            owner=owner,
            repo=repo_name,
            full_name=data.get("full_name", f"{owner}/{repo_name}"),
            default_branch=default_branch,
            is_private=data.get("private", False),
            description=data.get("description"),
            has_package_json=has_pkg,
            has_lockfile=has_lock,
            latest_commit_sha=commit_sha
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to inspect GitHub repo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/archive", response_model=GraphAnalysisResponse, summary="Upload a project ZIP archive or folder bundle safely")
async def import_project_archive(
    request: Request,
    file: UploadFile = File(...),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Safely uploads and extracts a project archive (ZIP).
    - Protects against ZIP bombs (file count & uncompressed size limits).
    - Blocks path traversal attacks (.. in paths).
    - Locates package.json and lockfile without executing code.
    - Builds dependency graph and executes analysis.
    """
    session_key = resolve_session_key(request, x_session_id)
    try:
        archive_bytes = await file.read()
        pkg_json, pkg_lock, meta = import_service.extract_manifests_from_zip(archive_bytes)

        analysis_res = import_service.execute_import_pipeline(
            package_json=pkg_json,
            package_lock_json=pkg_lock,
            import_source="archive_upload",
            repo=repo,
            session_id=session_key
        )

        norm_manifest = NodeJsManifestParser.parse_package_json(pkg_json)
        if pkg_lock:
            norm_manifest = NodeJsManifestParser.parse_package_lock(pkg_lock, norm_manifest)
        G = graph_service.build_graph(norm_manifest)

        active_entry = {
            "graph": G,
            "project_name": norm_manifest.name,
            "project_version": norm_manifest.version,
            "analysis_id": analysis_res.analysis_id,
            "project_id": getattr(analysis_res, "project_id", None)
        }
        store_active_graph(active_entry, session_id=session_key)

        return analysis_res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Archive upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process project archive: {str(e)}")


# =========================================================================
# DEPENDENCY IMPACT EXPLORER ENDPOINT
# =========================================================================

from app.schemas.impact import ImpactExplorerResponse

@router.get("/impact/explore", response_model=ImpactExplorerResponse, summary="Deep dependency impact exploration for a target package")
async def explore_dependency_impact(
    request: Request,
    target_package: str = Query(..., description="Target package to inspect downstream blast radius and upstream dependencies"),
    analysis_id: Optional[str] = Query(None, description="Optional analysis ID to evaluate against"),
    max_paths: int = Query(25, ge=1, le=100, description="Maximum number of exact dependency paths to compute"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Explores dependency impact for a package:
    - Direct dependencies (outgoing edges)
    - Direct dependents (incoming edges)
    - Transitive dependents (reverse graph cascade with depth >= 2)
    - All downstream affected packages
    - Exact dependency paths
    - Security advisories associated with target package
    """
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(status_code=404, detail=f"Analysis run '{analysis_id}' not found.")
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(status_code=409, detail=f"Active graph does not match analysis ID '{analysis_id}'.")

    if not cached:
        raise HTTPException(status_code=404, detail="No active project graph available. Please import or analyze a project first.")

    G = cached["graph"]
    target_clean = target_package.strip()
    if target_clean not in G:
        raise HTTPException(status_code=404, detail=f"Package '{target_clean}' does not exist in the active dependency graph.")

    # Retrieve security findings if available
    findings_list = []
    target_id = analysis_id or cached.get("analysis_id")
    if repo and target_id:
        try:
            records = repo.get_vulnerability_records(target_id)
            for r in records:
                findings_list.append({
                    "package_name": r.package_name,
                    "scan_status": "vulnerable",
                    "vuln_id": r.vuln_id,
                    "summary": r.summary,
                    "severity": r.severity
                })
        except Exception as e:
            logger.warning(f"Could not load security records for impact explorer: {e}")

    impact_res = graph_service.explore_impact(
        G=G,
        target_package=target_clean,
        max_paths=max_paths,
        security_findings=findings_list
    )
    return impact_res


# =========================================================================
# DEPENDENCY RISK SCORE ENDPOINTS
# =========================================================================

from app.schemas.risk import ProjectRiskScore
from app.services.risk_service import DependencyRiskService

risk_service = DependencyRiskService()

async def _calculate_risk(
    request: Request,
    analysis_id: Optional[str] = None,
    repo: Optional[ProjectRepository] = None,
    x_session_id: Optional[str] = None
) -> ProjectRiskScore:
    """
    Evaluates transparent, explainable 4-factor risk score (0-100):
    1. OSV Vulnerability Severity (35%)
    2. LibYear Freshness (25%)
    3. Downstream Dependent Blast Radius (20%)
    4. Dependency Criticality & Topological Importance (20%)
    """
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(status_code=404, detail=f"Analysis run '{analysis_id}' not found.")
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(status_code=409, detail=f"Active graph does not match analysis ID '{analysis_id}'.")

    if not cached:
        raise HTTPException(status_code=404, detail="No active project graph available. Please import or analyze a project first.")

    G = cached["graph"]
    root_pkg = cached["project_name"]
    project_version = cached.get("project_version", "1.0.0")
    target_id = analysis_id or cached.get("analysis_id")

    # Load vulnerability findings from DB if available
    security_map: Dict[str, list] = {}
    freshness_map: Dict[str, dict] = {}
    if repo and target_id:
        try:
            sec_records = repo.get_vulnerability_records(target_id)
            for r in sec_records:
                security_map.setdefault(r.package_name, []).append({
                    "id": r.vuln_id,
                    "summary": r.summary,
                    "severity": r.severity
                })
        except Exception as e:
            logger.warning(f"Could not load vulnerability findings for risk calculation: {e}")

        try:
            fresh_records = repo.get_freshness_records(target_id)
            for f in fresh_records:
                freshness_map[f.package_name] = {
                    "libyear": f.libyear,
                    "status": "scored" if f.libyear is not None else "unscored",
                    "reason_unscored": f.reason_unscored
                }
        except Exception as e:
            logger.warning(f"Could not load freshness records for risk calculation: {e}")

    risk_result = risk_service.evaluate_project_risk(
        graph=G,
        root_package=root_pkg,
        project_name=root_pkg,
        project_version=project_version,
        analysis_id=target_id,
        security_findings=security_map,
        freshness_records=freshness_map
    )

    # Persist risk metrics in DB if target_id is present
    if repo and target_id:
        try:
            repo.update_analysis_risk(
                analysis_id=target_id,
                risk_score=risk_result.overall_score,
                risk_category=risk_result.overall_category,
                risk_factors=risk_result.factor_weights
            )
        except Exception as e:
            logger.warning(f"Could not update risk score in repository: {e}")

    return risk_result


@router.get("/risk/evaluate", response_model=ProjectRiskScore, summary="Calculate explainable 4-factor dependency risk score")
@router.post("/risk/evaluate", response_model=ProjectRiskScore, summary="Calculate explainable 4-factor dependency risk score")
async def evaluate_active_risk(
    request: Request,
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    return await _calculate_risk(request=request, analysis_id=None, repo=repo, x_session_id=x_session_id)


@router.get("/risk/{analysis_id}", response_model=ProjectRiskScore, summary="Get comprehensive 4-factor risk score for an analysis run")
async def get_analysis_risk_by_id(
    request: Request,
    analysis_id: str,
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    return await _calculate_risk(request=request, analysis_id=analysis_id, repo=repo, x_session_id=x_session_id)


# =========================================================================
# BEFORE-AND-AFTER GRAPH COMPARISON ENDPOINT
# =========================================================================

from app.schemas.comparison import GraphComparisonResponse

@router.post("/simulate/compare", response_model=GraphComparisonResponse, summary="Compare baseline graph against simulated what-if mutation")
async def compare_simulated_change(
    request: Request,
    sim_request: SimulationRequest,
    analysis_id: Optional[str] = Query(None, description="Optional target analysis ID to compare against"),
    repo: Optional[ProjectRepository] = Depends(get_optional_repo),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Executes What-If simulation and produces a comprehensive before-and-after comparison:
    - Structural diff (added, removed, modified nodes and edges)
    - Newly affected vs relieved downstream packages
    - Introduced vs resolved security vulnerabilities
    - Before-and-after composite risk scores
    - Unified cytoscape node and edge visual diff payloads
    """
    limiter.check_rate_limit(request, "simulate", settings.RATE_LIMIT_SIMULATE)
    session_key = resolve_session_key(request, x_session_id)
    cached = get_active_graph(analysis_id=analysis_id, session_id=session_key)

    if analysis_id:
        if not cached or cached.get("analysis_id") != analysis_id:
            if repo:
                analysis = repo.get_analysis_by_id(analysis_id)
                if not analysis or not analysis.graph_snapshot:
                    raise HTTPException(status_code=404, detail=f"Analysis run '{analysis_id}' not found.")
                cached = restore_graph_from_snapshot(analysis, session_id=session_key)
            else:
                raise HTTPException(status_code=409, detail=f"Active graph does not match analysis ID '{analysis_id}'.")

    if not cached:
        raise HTTPException(status_code=404, detail="No active project graph available. Please import or analyze a project first.")

    baseline_graph = cached["graph"]
    root_pkg = cached["project_name"]
    project_version = cached.get("project_version", "1.0.0")
    target_id = analysis_id or cached.get("analysis_id")

    # Load security and freshness records
    sec_map: Dict[str, list] = {}
    fresh_map: Dict[str, dict] = {}
    if repo and target_id:
        try:
            records = repo.get_vulnerability_records(target_id)
            for r in records:
                sec_map.setdefault(r.package_name, []).append({
                    "id": r.vuln_id,
                    "summary": r.summary,
                    "severity": r.severity
                })
        except Exception:
            pass
        try:
            f_records = repo.get_freshness_records(target_id)
            for f in f_records:
                fresh_map[f.package_name] = {"libyear": f.libyear}
        except Exception:
            pass

    try:
        comparison_res = simulation_service.compare_simulation(
            baseline_graph=baseline_graph,
            root_package=root_pkg,
            request=sim_request,
            project_version=project_version,
            security_findings=sec_map,
            freshness_records=fresh_map
        )
        return comparison_res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Comparison simulation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Simulation comparison error: {str(e)}")


