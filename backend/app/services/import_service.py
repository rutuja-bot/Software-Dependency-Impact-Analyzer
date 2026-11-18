import os
import re
import io
import json
import base64
import zipfile
import logging
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse
import requests

from app.core.config import settings
from app.parsers.nodejs import NodeJsManifestParser, NormalizedProjectManifest
from app.services.graph_service import DependencyGraphService
from app.schemas.graph import GraphAnalysisResponse
from app.db.repository import ProjectRepository

logger = logging.getLogger(__name__)

# Security & archive constants
MAX_ZIP_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MiB archive upload ceiling
MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024  # 60 MiB uncompressed zip ceiling (zip bomb guard)
MAX_FILE_COUNT = 1500  # Max total files inside archive
MAX_PATH_DEPTH = 10  # Max path directory nesting

GITHUB_API_BASE = "https://api.github.com"
GITHUB_URL_REGEX = re.compile(
    r"^https?://(?:www\.)?github\.com/(?P<owner>[a-zA-Z0-9_\-\.]+)/(?P<repo>[a-zA-Z0-9_\-\.]+?)(?:\.git)?(?:/(?:tree|commits?)/(?P<branch>[^/]+))?/?$"
)

class ProjectImportService:
    """
    Unified multi-source software project import service.
    
    Supports:
    1. GitHub Repository Import (public + private with secure token)
    2. Local Project Folder / ZIP Archive Upload (safe extraction, zip-bomb & path traversal protection)
    3. Direct Dependency Manifest Input (package.json + package-lock.json)
    
    Security & Architecture Guarantees:
    - SSRF prevention on GitHub URLs (whitelisted to github.com domains only).
    - Zero execution of uploaded code or package scripts.
    - Path traversal prevention on ZIP extraction.
    - Re-uses existing parser, graph engine, and database persistence pipeline without duplication.
    """

    def __init__(self, graph_service: Optional[DependencyGraphService] = None):
        self.graph_service = graph_service or DependencyGraphService()

    # =========================================================================
    # 1. GitHub Repository Import
    # =========================================================================

    @staticmethod
    def parse_github_url(url: str) -> Tuple[str, str, Optional[str]]:
        """
        Validates and parses a GitHub repository URL.
        Returns (owner, repo, optional_branch_from_url).
        Rejects SSRF attempts, loopback IPs, and non-github domains.
        """
        clean_url = (url or "").strip()
        if not clean_url:
            raise ValueError("GitHub repository URL cannot be empty.")

        parsed = urlparse(clean_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Repository URL must use HTTP or HTTPS protocol.")

        hostname = (parsed.hostname or "").lower()
        if hostname not in ("github.com", "www.github.com"):
            raise ValueError(f"Invalid repository host '{hostname}'. Only official GitHub URLs (github.com) are supported.")

        match = GITHUB_URL_REGEX.match(clean_url)
        if not match:
            raise ValueError(
                "Invalid GitHub repository URL format. Expected: https://github.com/owner/repository"
            )

        owner = match.group("owner")
        repo = match.group("repo")
        branch = match.group("branch")

        # Reject path traversal segments
        if ".." in owner or ".." in repo:
            raise ValueError("Repository path contains forbidden traversal characters.")

        return owner, repo, branch

    def fetch_github_manifests(
        self,
        owner: str,
        repo: str,
        branch: Optional[str] = None,
        auth_token: Optional[str] = None
    ) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], str, str]:
        """
        Retrieves package.json and package-lock.json from GitHub repository via GitHub REST API.
        Returns: (package_json_dict, package_lock_dict, resolved_branch, commit_sha)
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SoftwareDependencyImpactAnalyzer/1.0"
        }
        effective_token = (auth_token or "").strip() or getattr(settings, "GITHUB_TOKEN", None) or (os.getenv("GITHUB_TOKEN") or "").strip() or None
        if effective_token:
            headers["Authorization"] = f"Bearer {effective_token}"

        # 1. Fetch Repository Info to determine default branch if not specified
        repo_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"
        try:
            r_info = requests.get(repo_url, headers=headers, timeout=10.0)
        except requests.RequestException as e:
            raise ValueError(f"Network error contacting GitHub API: {str(e)}")

        if r_info.status_code == 404:
            raise ValueError(
                f"GitHub repository '{owner}/{repo}' was not found. Please verify the URL. "
                "For private repositories, provide a GitHub Personal Access Token."
            )
        elif r_info.status_code == 401:
            raise ValueError("GitHub authentication failed. Please verify your Personal Access Token.")
        elif r_info.status_code in (403, 429):
            raise ValueError(
                "GitHub API rate limit reached. Configure GITHUB_TOKEN on the server or supply a Personal Access Token in the import dialog."
            )
        elif r_info.status_code != 200:
            raise ValueError(f"GitHub API returned unexpected HTTP status {r_info.status_code} for repository '{owner}/{repo}'.")

        repo_data = r_info.json()
        target_branch = branch or repo_data.get("default_branch", "main")

        # 2. Retrieve latest commit SHA on target branch for reproducibility
        commit_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{target_branch}"
        commit_sha = "unknown"
        try:
            r_commit = requests.get(commit_url, headers=headers, timeout=10.0)
            if r_commit.status_code == 200:
                commit_sha = r_commit.json().get("sha", "unknown")
        except Exception:
            pass

        # 3. Retrieve package.json
        pkg_json_data = self._fetch_github_file(owner, repo, "package.json", target_branch, headers)
        if not pkg_json_data:
            raise ValueError(
                f"Repository '{owner}/{repo}' on branch '{target_branch}' does not contain a root package.json file."
            )

        # 4. Retrieve package-lock.json (optional but preferred for resolved lock graph)
        pkg_lock_data = self._fetch_github_file(owner, repo, "package-lock.json", target_branch, headers)

        return pkg_json_data, pkg_lock_data, target_branch, commit_sha

    def _fetch_github_file(
        self,
        owner: str,
        repo: str,
        path: str,
        branch: str,
        headers: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        try:
            res = requests.get(url, headers=headers, timeout=10.0)
            if res.status_code in (403, 429):
                raise ValueError(
                    "GitHub API rate limit reached. Configure GITHUB_TOKEN on the server or supply a Personal Access Token in the import dialog."
                )
            if res.status_code != 200:
                return None
            data = res.json()
            if isinstance(data, dict) and data.get("encoding") == "base64" and "content" in data:
                raw_bytes = base64.b64decode(data["content"])
                return json.loads(raw_bytes.decode("utf-8"))
            elif isinstance(data, dict) and "download_url" in data:
                dl = requests.get(data["download_url"], headers=headers, timeout=10.0)
                if dl.status_code == 200:
                    return dl.json()
        except Exception as e:
            logger.warning(f"Failed to fetch {path} from {owner}/{repo}: {e}")
        return None

    # =========================================================================
    # 2. Local Project Folder / ZIP Archive Import
    # =========================================================================

    @staticmethod
    def extract_manifests_from_zip(archive_bytes: bytes) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], Dict[str, Any]]:
        """
        Safely inspects and extracts package.json and optional lockfile from a ZIP archive.
        Guarantees protection against:
        - Path traversal attacks (.. in file paths)
        - Absolute path injections
        - Zip bombs (uncompressed expansion limits)
        - Symlink attacks
        """
        if len(archive_bytes) > MAX_ZIP_UPLOAD_BYTES:
            max_mb = MAX_ZIP_UPLOAD_BYTES // (1024 * 1024)
            raise ValueError(f"Uploaded archive exceeds maximum allowed size of {max_mb} MiB.")

        try:
            zf = zipfile.ZipFile(io.BytesIO(archive_bytes))
        except zipfile.BadZipFile:
            raise ValueError("The uploaded file is not a valid or readable ZIP archive.")

        infolist = zf.infolist()
        if len(infolist) > MAX_FILE_COUNT:
            raise ValueError(f"Archive contains too many files ({len(infolist)} files). Maximum allowed is {MAX_FILE_COUNT}.")

        total_uncompressed = 0
        package_json_candidates = []
        lockfile_candidates = []

        for info in infolist:
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                max_uncompressed_mb = MAX_UNCOMPRESSED_BYTES // (1024 * 1024)
                raise ValueError(
                    f"Archive uncompressed size exceeds safety ceiling of {max_uncompressed_mb} MiB (Zip bomb guard)."
                )

            # Security sanitization on filename
            filename = info.filename.replace("\\", "/")
            if ".." in filename or filename.startswith("/") or re.match(r"^[a-zA-Z]:", filename):
                raise ValueError(f"Archive contains suspicious path traversal sequence: '{info.filename}'")

            # Ignore node_modules, git, and vendor subdirectories
            parts = [p for p in filename.split("/") if p]
            if any(p.lower() in ("node_modules", ".git", ".svn", "vendor") for p in parts):
                continue

            base_name = parts[-1].lower() if parts else ""
            depth = len(parts)

            if base_name == "package.json":
                package_json_candidates.append((depth, info))
            elif base_name == "package-lock.json":
                lockfile_candidates.append((depth, info))

        if not package_json_candidates:
            raise ValueError(
                "Could not find a valid 'package.json' file in the uploaded project archive. "
                "Please ensure the root or top-level project folder contains package.json."
            )

        # Select the shallowest package.json (root or top-level folder)
        package_json_candidates.sort(key=lambda x: x[0])
        chosen_pkg_depth, chosen_pkg_info = package_json_candidates[0]

        try:
            with zf.open(chosen_pkg_info) as f:
                content = f.read().decode("utf-8")
                pkg_json = json.loads(content)
        except Exception as e:
            raise ValueError(f"Failed to read or parse 'package.json' from archive: {str(e)}")

        # Find matching sibling package-lock.json in same directory if possible
        chosen_dir = "/".join(chosen_pkg_info.filename.replace("\\", "/").split("/")[:-1])
        pkg_lock = None
        for depth, lock_info in lockfile_candidates:
            lock_dir = "/".join(lock_info.filename.replace("\\", "/").split("/")[:-1])
            if lock_dir == chosen_dir:
                try:
                    with zf.open(lock_info) as f:
                        lock_content = f.read().decode("utf-8")
                        pkg_lock = json.loads(lock_content)
                    break
                except Exception as e:
                    logger.warning(f"Failed to parse lockfile '{lock_info.filename}': {e}")

        archive_meta = {
            "archive_files_count": len(infolist),
            "manifest_path": chosen_pkg_info.filename,
            "has_lockfile": pkg_lock is not None,
            "archive_compressed_bytes": len(archive_bytes),
            "archive_uncompressed_bytes": total_uncompressed
        }

        return pkg_json, pkg_lock, archive_meta

    # =========================================================================
    # 3. Unified Pipeline Execution
    # =========================================================================

    def execute_import_pipeline(
        self,
        package_json: Dict[str, Any],
        package_lock_json: Optional[Dict[str, Any]],
        import_source: str = "manifest_upload",
        repository_url: Optional[str] = None,
        branch_name: Optional[str] = None,
        commit_sha: Optional[str] = None,
        repo: Optional[ProjectRepository] = None,
        session_id: Optional[str] = None
    ) -> GraphAnalysisResponse:
        """
        Executes the unified import workflow:
        Validate -> Parse -> Build Graph -> Analyze -> Persist (if DB available) -> Cache Active Graph.
        """
        # 1. Parse manifest and optional lockfile
        manifest = NodeJsManifestParser.parse_package_json(package_json)
        if package_lock_json:
            manifest = NodeJsManifestParser.parse_package_lock(package_lock_json, manifest)

        # 2. Build Dependency Graph
        G = self.graph_service.build_graph(manifest)

        # 3. Analyze Graph (topological sort, cycles, statistics)
        analysis_res = self.graph_service.analyze_graph(
            G,
            root_name=manifest.name,
            project_version=manifest.version
        )
        analysis_res.has_lockfile = manifest.has_lockfile
        analysis_res.lockfile_version = manifest.lockfile_version
        analysis_res.import_source = import_source
        analysis_res.repository_url = repository_url
        analysis_res.branch_name = branch_name
        analysis_res.commit_sha = commit_sha

        # 4. Persist in Database if configured
        persisted_analysis_id = None
        if repo:
            try:
                project = repo.get_or_create_project(
                    name=manifest.name,
                    ecosystem="npm",
                    description=f"Imported from {import_source}"
                )
                # Update project provenance metadata
                project.import_source = import_source
                if repository_url:
                    project.repository_url = repository_url
                if branch_name:
                    project.default_branch = branch_name

                manifest_meta = {
                    "package_name": manifest.name,
                    "package_version": manifest.version,
                    "has_lockfile": manifest.has_lockfile,
                    "lockfile_version": manifest.lockfile_version,
                    "import_source": import_source,
                    "repository_url": repository_url,
                    "branch_name": branch_name,
                    "commit_sha": commit_sha
                }

                recorded = repo.record_analysis_run(
                    project=project,
                    analysis_data=analysis_res,
                    manifest_metadata=manifest_meta,
                    status="completed",
                    import_source=import_source,
                    repository_url=repository_url,
                    branch_name=branch_name,
                    commit_sha=commit_sha
                )
                persisted_analysis_id = recorded.id
            except Exception as e:
                logger.error(f"Failed to persist imported project analysis: {e}", exc_info=True)
                try:
                    repo.db.rollback()
                except Exception:
                    pass

        # 5. Populate analysis_id on response
        if persisted_analysis_id:
            analysis_res.analysis_id = persisted_analysis_id

        return analysis_res
