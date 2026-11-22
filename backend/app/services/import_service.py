import os
import re
import io
import json
import base64
import zipfile
import logging
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse, urljoin, urlsplit, quote
import requests

from app.core.config import settings
from app.parsers.nodejs import NodeJsManifestParser, NormalizedProjectManifest
from app.services.graph_service import DependencyGraphService
from app.schemas.graph import GraphAnalysisResponse
from app.db.repository import ProjectRepository
from app.security.pre_analysis_guard import (
    validate_repository_url,
    validate_manifest_content,
    parse_json_safely,
    scrub_sensitive_tokens,
    ALLOWED_REDIRECT_HOSTS,
    MAX_LOCKFILE_BYTES
)

logger = logging.getLogger(__name__)

# Security & archive constants
MAX_ZIP_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MiB archive upload ceiling
MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024  # 60 MiB uncompressed zip ceiling (zip bomb guard)
MAX_FILE_COUNT = 1500  # Max total files inside archive
MAX_PATH_DEPTH = 10  # Max path directory nesting
MAX_COMPRESSION_RATIO = 100.0  # Max compression ratio for members > 1 MB

BRANCH_NAME_REGEX = re.compile(r"^[A-Za-z0-9._/-]+$")
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
        Validates and parses a GitHub repository URL via the pre-analysis security guard.
        Returns (owner, repo, optional_branch_from_url).
        """
        return validate_repository_url(url)

    @staticmethod
    def _safe_github_get(
        url: str,
        headers: Dict[str, str],
        timeout: float = 10.0,
        max_redirects: int = 5
    ) -> requests.Response:
        """
        Executes HTTP GET against GitHub with strict redirect validation:
        - Validates initial URL host is in ALLOWED_REDIRECT_HOSTS.
        - Follows redirects only to ALLOWED_REDIRECT_HOSTS.
        - Strips Authorization header if host is other than api.github.com.
        """
        parsed_initial = urlsplit(url)
        initial_host = (parsed_initial.hostname or "").lower()
        if initial_host not in ALLOWED_REDIRECT_HOSTS:
            raise ValueError(f"HTTP request to unverified host '{initial_host}' is blocked for security.")

        current_url = url
        current_headers = dict(headers)
        if initial_host != "api.github.com":
            current_headers = {k: v for k, v in current_headers.items() if k.lower() != "authorization"}

        for _ in range(max_redirects + 1):
            res = requests.get(current_url, headers=current_headers, allow_redirects=False, timeout=timeout)
            is_redirect = (res.status_code in (301, 302, 303, 307, 308)) or (getattr(res, "is_redirect", False) is True)
            if is_redirect:
                location = res.headers.get("Location")
                if not location:
                    return res
                next_url = urljoin(current_url, str(location))
                parsed_next = urlsplit(next_url)
                next_host = (parsed_next.hostname or "").lower()
                if next_host not in ALLOWED_REDIRECT_HOSTS:
                    raise ValueError(f"HTTP redirect to unverified host '{next_host}' is blocked for security.")
                if next_host != "api.github.com":
                    current_headers = {k: v for k, v in current_headers.items() if k.lower() != "authorization"}
                current_url = next_url
            else:
                return res
        return res

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
        # Validate user-supplied branch upfront before any network calls
        if branch is not None:
            if not BRANCH_NAME_REGEX.match(branch) or ".." in branch:
                raise ValueError(f"Invalid branch name '{branch}'. Branch contains illegal characters.")

        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SoftwareDependencyImpactAnalyzer/1.0"
        }
        user_token_supplied = bool(auth_token and auth_token.strip())
        effective_token = (auth_token or "").strip() or getattr(settings, "GITHUB_TOKEN", None) or (os.getenv("GITHUB_TOKEN") or "").strip() or None
        if effective_token:
            headers["Authorization"] = f"Bearer {effective_token}"

        # 1. Fetch Repository Info to determine default branch if not specified
        repo_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"
        try:
            r_info = self._safe_github_get(repo_url, headers=headers, timeout=10.0)
        except requests.RequestException as e:
            cleaned_err = scrub_sensitive_tokens(str(e), effective_token)
            raise ValueError(f"Network error contacting GitHub API: {cleaned_err}")
        except Exception as e:
            cleaned_err = scrub_sensitive_tokens(str(e), effective_token)
            raise ValueError(cleaned_err)

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
        is_private = bool(repo_data.get("private", False))
        if is_private and not user_token_supplied:
            raise ValueError(
                f"GitHub repository '{owner}/{repo}' is private. A personal GitHub Access Token is required to import private repositories. Server default token cannot be used to import private repositories."
            )

        target_branch = branch or repo_data.get("default_branch", "main")
        if not BRANCH_NAME_REGEX.match(target_branch) or ".." in target_branch:
            raise ValueError(f"Invalid branch name '{target_branch}'. Branch contains illegal characters.")

        quoted_branch = quote(target_branch, safe="/")

        # 2. Retrieve latest commit SHA on target branch for reproducibility
        commit_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{quoted_branch}"
        commit_sha = "unknown"
        try:
            r_commit = self._safe_github_get(commit_url, headers=headers, timeout=10.0)
            if r_commit.status_code == 200:
                commit_sha = r_commit.json().get("sha", "unknown")
        except Exception:
            pass

        # 3. Retrieve package.json
        pkg_json_data = self._fetch_github_file(owner, repo, "package.json", quoted_branch, headers)
        if not pkg_json_data:
            raise ValueError(
                f"Repository '{owner}/{repo}' on branch '{target_branch}' does not contain a root package.json file."
            )

        # 4. Retrieve package-lock.json (optional but preferred for resolved lock graph)
        pkg_lock_data = self._fetch_github_file(owner, repo, "package-lock.json", quoted_branch, headers)

        return pkg_json_data, pkg_lock_data, target_branch, commit_sha

    def _fetch_github_file(
        self,
        owner: str,
        repo: str,
        path: str,
        branch: str,
        headers: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        quoted_branch = quote(branch, safe="/")
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={quoted_branch}"
        max_bytes = MAX_LOCKFILE_BYTES if "lock" in path.lower() else 512 * 1024
        try:
            res = self._safe_github_get(url, headers=headers, timeout=10.0)
            if res.status_code in (403, 429):
                raise ValueError(
                    "GitHub API rate limit reached. Configure GITHUB_TOKEN on the server or supply a Personal Access Token in the import dialog."
                )
            if res.status_code != 200:
                return None
            data = res.json()
            if isinstance(data, dict) and data.get("encoding") == "base64" and "content" in data:
                raw_bytes = base64.b64decode(data["content"])
                return parse_json_safely(raw_bytes.decode("utf-8"), max_bytes=max_bytes)
            elif isinstance(data, dict) and "download_url" in data:
                dl = self._safe_github_get(data["download_url"], headers=headers, timeout=10.0)
                if dl.status_code == 200:
                    return parse_json_safely(dl.text, max_bytes=max_bytes)
        except Exception as e:
            logger.warning(f"Failed to fetch {path} from {owner}/{repo}: {scrub_sensitive_tokens(str(e))}")
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

            # Compression-ratio check (Zip bomb guard)
            if info.compress_size > 0:
                ratio = info.file_size / info.compress_size
                if ratio > MAX_COMPRESSION_RATIO and info.file_size > 1024 * 1024:
                    raise ValueError(
                        f"Archive member '{info.filename}' has suspicious compression ratio ({ratio:.1f}:1). Potential zip bomb."
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

        if chosen_pkg_info.file_size > 512 * 1024:
            raise ValueError(
                f"Archive member '{chosen_pkg_info.filename}' size ({chosen_pkg_info.file_size} bytes) exceeds safety limit of 512 KB."
            )

        try:
            with zf.open(chosen_pkg_info) as f:
                raw_pkg = f.read(512 * 1024 + 1)
                if len(raw_pkg) > 512 * 1024:
                    raise ValueError("Archive member 'package.json' exceeds safety limit of 512 KB.")
                content = raw_pkg.decode("utf-8")
                pkg_json = parse_json_safely(content, max_bytes=512 * 1024)
        except Exception as e:
            raise ValueError(f"Failed to read or parse 'package.json' from archive: {str(e)}")

        parts = [p for p in chosen_pkg_info.filename.replace("\\", "/").split("/") if p]
        top_folder = parts[0] if len(parts) > 1 else "unnamed-project"
        hard_errs, _ = validate_manifest_content(pkg_json, is_lockfile=False, fallback_name=top_folder)
        if hard_errs:
            raise ValueError(f"Manifest anomaly in archive package.json: {'; '.join(hard_errs)}")

        # Find matching sibling package-lock.json in same directory if possible
        chosen_dir = "/".join(chosen_pkg_info.filename.replace("\\", "/").split("/")[:-1])
        pkg_lock = None
        lock_warnings: List[str] = []
        for depth, lock_info in lockfile_candidates:
            lock_dir = "/".join(lock_info.filename.replace("\\", "/").split("/")[:-1])
            if lock_dir == chosen_dir:
                if lock_info.file_size > MAX_LOCKFILE_BYTES:
                    lock_warnings.append(
                        f"Lockfile ignored: file size ({lock_info.file_size} bytes) exceeds safety limit of {MAX_LOCKFILE_BYTES // (1024 * 1024)} MB."
                    )
                    continue
                try:
                    with zf.open(lock_info) as f:
                        raw_lock = f.read(MAX_LOCKFILE_BYTES + 1)
                        if len(raw_lock) > MAX_LOCKFILE_BYTES:
                            lock_warnings.append(
                                f"Lockfile ignored: exceeds safety limit of {MAX_LOCKFILE_BYTES // (1024 * 1024)} MB."
                            )
                            continue
                        lock_content = raw_lock.decode("utf-8")
                        pkg_lock = parse_json_safely(lock_content, max_bytes=MAX_LOCKFILE_BYTES)
                    lock_hard_errs, _ = validate_manifest_content(pkg_lock, is_lockfile=True)
                    if lock_hard_errs:
                        reason = "; ".join(lock_hard_errs)
                        lock_warnings.append(f"Lockfile ignored: {reason}")
                        logger.warning(f"Ignoring invalid lockfile in archive '{lock_info.filename}': {reason}")
                        pkg_lock = None
                    else:
                        break
                except Exception as e:
                    reason = str(e)
                    lock_warnings.append(f"Lockfile ignored: {reason}")
                    logger.warning(f"Failed to parse lockfile '{lock_info.filename}': {reason}")
                    pkg_lock = None

        archive_meta = {
            "archive_files_count": len(infolist),
            "manifest_path": chosen_pkg_info.filename,
            "has_lockfile": pkg_lock is not None,
            "archive_compressed_bytes": len(archive_bytes),
            "archive_uncompressed_bytes": total_uncompressed,
            "lock_warnings": lock_warnings,
            "top_level_folder": top_folder
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
        extra_warnings: Optional[List[str]] = None,
        fallback_name: Optional[str] = None,
        repo: Optional[ProjectRepository] = None,
        session_id: Optional[str] = None
    ) -> GraphAnalysisResponse:
        """
        Executes the unified import workflow:
        Validate -> Parse -> Build Graph -> Analyze -> Persist (if DB available) -> Cache Active Graph.
        """
        # Pre-analysis security guard: validate manifests
        resolved_fallback = (
            (repository_url.split('/')[-1] if repository_url else None)
            or fallback_name
            or "unnamed-project"
        )
        pkg_hard_errs, pkg_warnings = validate_manifest_content(
            package_json,
            is_lockfile=False,
            fallback_name=resolved_fallback
        )
        if pkg_hard_errs:
            raise ValueError('; '.join(pkg_hard_errs))

        lock_warnings = []
        if package_lock_json:
            lock_hard_errs, lock_warnings = validate_manifest_content(package_lock_json, is_lockfile=True)
            if lock_hard_errs:
                raise ValueError('; '.join(lock_hard_errs))

        all_manifest_warnings = pkg_warnings + lock_warnings + (extra_warnings or [])

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
        analysis_res.manifest_warnings = all_manifest_warnings

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
