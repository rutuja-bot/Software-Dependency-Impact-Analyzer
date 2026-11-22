import re
import json
import logging
import ipaddress
from typing import Dict, Any, List, Optional, Tuple, Set
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

# =============================================================================
# Constants & Allowlist Configurations
# =============================================================================

# Supported platforms with real import support
SUPPORTED_REPOSITORY_HOSTS: Set[str] = {
    "github.com",
    "www.github.com"
}

# Verified well-known platforms recognized by security policy but without import support
VERIFIED_UNSUPPORTED_HOSTS: Set[str] = {
    "gitlab.com",
    "www.gitlab.com",
    "bitbucket.org",
    "www.bitbucket.org"
}

# Hosts permitted as targets for GitHub API HTTP redirects
ALLOWED_REDIRECT_HOSTS: Set[str] = {
    "api.github.com",
    "raw.githubusercontent.com",
    "codeload.github.com"
}

# Size and complexity limits
MAX_PACKAGE_JSON_BYTES = 512 * 1024            # 512 KB
MAX_LOCKFILE_BYTES = 50 * 1024 * 1024           # 50 MB (User requirement: 50 MB)
MAX_PACKAGE_JSON_DIRECT_DEPS = 500             # 500 direct dependencies in package.json
MAX_LOCKFILE_PACKAGES = 10000                  # 10,000 packages (User requirement: 10,000)
MAX_JSON_NESTING_DEPTH = 20                    # 20 levels recursion ceiling
MAX_LOCKFILE_NESTING_DEPTH = 100               # 100 levels recursion ceiling for lockfiles

DANGEROUS_KEYS: Set[str] = {"__proto__", "constructor", "prototype"}

SUSPICIOUS_LIFECYCLE_SCRIPTS: Set[str] = {
    "preinstall", "install", "postinstall", "prepublish", "prepack"
}

SUSPICIOUS_COMMAND_PATTERNS = re.compile(
    r"\b(curl|wget|eval|base64|bash|sh|powershell|cmd\.exe|nc|netcat)\b",
    re.IGNORECASE
)

GITHUB_REPO_PATH_REGEX = re.compile(
    r"^/(?P<owner>[a-zA-Z0-9_\-\.]+)/(?P<repo>[a-zA-Z0-9_\-\.]+?)(?:\.git)?(?:/(?:tree|commits?)/(?P<branch>[^/]+))?/?$"
)

PACKAGE_NAME_REGEX = re.compile(
    r"^(?:@[a-z0-9_.\-]+/)?[a-z0-9_.\-]+$",
    re.IGNORECASE
)


# =============================================================================
# 1. URL & Platform Validation
# =============================================================================

def validate_repository_url(url: str) -> Tuple[str, str, Optional[str]]:
    """
    Parses and strictly validates a repository URL against the verified platform allowlist.
    Returns (owner, repo, optional_branch).
    
    Protects against:
    - Userinfo credentials injection (github.com@evil.com)
    - Lookalike domains & Punycode/IDN homographs (g1thub.com, cyrillic domains)
    - Non-HTTPS schemes (http:, file:, javascript:, data:)
    - Explicit non-standard ports
    - Raw IP addresses, localhost, private IP ranges (SSRF)
    - Path traversal segments ('..')
    """
    clean_url = (url or "").strip()
    if not clean_url:
        raise ValueError("Repository URL cannot be empty.")

    try:
        parsed = urlsplit(clean_url)
    except Exception as e:
        raise ValueError(f"Malformed repository URL: {str(e)}")

    # 1. Enforce HTTPS scheme strictly
    scheme = (parsed.scheme or "").lower()
    if scheme != "https":
        raise ValueError(
            f"Invalid repository host or scheme '{scheme}'. Only secure HTTPS repository URLs are permitted (e.g. https://github.com/owner/repo)."
        )

    # 2. Reject userinfo tricks (e.g. https://github.com@evil.com or https://user:pass@github.com)
    if parsed.username or parsed.password or ("@" in parsed.netloc):
        raise ValueError("Invalid repository host: repository URL contains forbidden userinfo credentials.")

    # 3. Reject non-standard explicit ports
    if parsed.port is not None and parsed.port != 443:
        raise ValueError(f"Invalid repository host: Explicit port ':{parsed.port}' is not permitted. Only standard HTTPS (port 443) is allowed.")

    # 4. Hostname extraction and normalization
    raw_host = parsed.hostname
    if not raw_host:
        raise ValueError("Invalid repository host: repository URL is missing a valid hostname.")

    # Decode IDN / Punycode homographs and lowercase
    try:
        ascii_host = raw_host.encode("idna").decode("ascii").lower().rstrip(".")
    except Exception:
        raise ValueError("Invalid repository host: repository URL contains an invalid host or homograph encoding.")

    # 5. Check for IP addresses, loopback, private ranges (SSRF prevention)
    try:
        ip = ipaddress.ip_address(ascii_host)
        raise ValueError("Invalid repository host: direct IP addresses and private network ranges are not permitted.")
    except ValueError as ip_err:
        if "Invalid repository host" in str(ip_err) or "direct IP addresses" in str(ip_err):
            raise
        # Not a raw IP address, proceed with hostname checks

    if ascii_host in ("localhost", "127.0.0.1", "::1") or ascii_host.endswith(".local") or ascii_host.endswith(".internal"):
        raise ValueError("Invalid repository host: Localhost and internal network addresses are strictly forbidden.")

    # 6. Allowlist verification (Exact Match)
    if ascii_host in VERIFIED_UNSUPPORTED_HOSTS:
        raise ValueError(
            f"Invalid repository host: Verified platform ({ascii_host}), but import is not supported yet. "
            "Only GitHub repositories can be imported currently."
        )

    if ascii_host not in SUPPORTED_REPOSITORY_HOSTS:
        raise ValueError(
            f"Invalid repository host: External link - could be hazardous. Host '{ascii_host}' is not a verified repository platform."
        )

    # 7. Path inspection
    path = parsed.path
    if not path or path == "/":
        raise ValueError("Repository URL must specify owner and repository name (e.g. https://github.com/owner/repo).")

    if ".." in path or "\\" in path:
        raise ValueError("Repository path contains forbidden traversal characters.")

    match = GITHUB_REPO_PATH_REGEX.match(path)
    if not match:
        raise ValueError("Invalid GitHub repository URL path. Expected format: https://github.com/owner/repository")

    owner = match.group("owner")
    repo = match.group("repo")
    branch = match.group("branch")

    if owner.lower() in ("settings", "organizations", "users", "explore", "trending"):
        raise ValueError(f"Path segment '{owner}' is a reserved GitHub namespace, not a valid repository owner.")

    return owner, repo, branch


# =============================================================================
# 2. JSON Parser with Duplicate Key Detection
# =============================================================================

def parse_json_safely(content: str, max_bytes: int = MAX_PACKAGE_JSON_BYTES) -> Any:
    """
    Parses a JSON string while:
    - Enforcing strict byte size ceiling.
    - Rejecting duplicate keys at any depth via object_pairs_hook.
    - Rejecting empty or whitespace-only content.
    """
    if not content or not content.strip():
        raise ValueError("Manifest content is empty.")

    raw_bytes = content.encode("utf-8")
    if len(raw_bytes) > max_bytes:
        limit_kb = max_bytes // 1024
        raise ValueError(f"Manifest size ({len(raw_bytes)} bytes) exceeds safety limit of {limit_kb} KB.")

    def _dict_factory(pairs):
        d = {}
        for key, value in pairs:
            if key in d:
                raise ValueError(f"Duplicate JSON key detected: '{key}'.")
            d[key] = value
        return d

    try:
        return json.loads(content, object_pairs_hook=_dict_factory)
    except RecursionError:
        raise ValueError("Manifest nesting is too deep to parse safely.")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON syntax: {e.msg} (line {e.lineno}, column {e.colno}).")


# =============================================================================
# 3. Manifest Anomaly Detection (Hard Errors vs Warnings)
# =============================================================================

def _compute_nesting_depth(data: Any, current_depth: int = 1, max_depth: int = MAX_JSON_NESTING_DEPTH) -> int:
    """Recursively computes maximum nesting depth of a JSON structure."""
    if current_depth > max_depth:
        return current_depth
    if isinstance(data, dict):
        if not data:
            return current_depth
        return max((_compute_nesting_depth(v, current_depth + 1, max_depth=max_depth) for v in data.values()), default=current_depth)
    elif isinstance(data, list):
        if not data:
            return current_depth
        return max((_compute_nesting_depth(item, current_depth + 1, max_depth=max_depth) for item in data), default=current_depth)
    return current_depth


def validate_manifest_content(
    manifest_data: Any,
    is_lockfile: bool = False,
    fallback_name: str = "unnamed-project"
) -> Tuple[List[str], List[str]]:
    """
    Evaluates manifest structure and returns (hard_errors, warnings).
    - If hard_errors is non-empty, analysis must be blocked (HTTP 400).
    - If warnings are present, they are reported without blocking.
    """
    hard_errors: List[str] = []
    warnings: List[str] = []

    if manifest_data is None:
        hard_errors.append("Manifest content is null or empty.")
        return hard_errors, warnings

    if not isinstance(manifest_data, dict):
        hard_errors.append(f"Manifest must be a top-level JSON object, received '{type(manifest_data).__name__}'.")
        return hard_errors, warnings

    # Nesting depth check
    allowed_depth = MAX_LOCKFILE_NESTING_DEPTH if is_lockfile else MAX_JSON_NESTING_DEPTH
    depth = _compute_nesting_depth(manifest_data, max_depth=allowed_depth)
    if depth > allowed_depth:
        hard_errors.append(
            f"Manifest exceeds maximum allowed nesting depth of {allowed_depth} levels (found {depth})."
        )
        return hard_errors, warnings

    # Prototype pollution / dangerous keys in top-level
    for k in manifest_data.keys():
        if k in DANGEROUS_KEYS:
            hard_errors.append(f"Dangerous key '{k}' detected in manifest root.")

    if not is_lockfile:
        # -------------------------------------------------------------
        # package.json validation
        # -------------------------------------------------------------
        name_val = manifest_data.get("name")
        if not name_val or not str(name_val).strip():
            # User requirement 1: Missing name is a WARNING with fallback
            warnings.append(
                f"Missing or empty 'name' field in package.json; using fallback '{fallback_name}'."
            )
        elif not isinstance(name_val, str):
            hard_errors.append(f"Field 'name' must be a string, received '{type(name_val).__name__}'.")
        elif len(name_val) > 214:
            hard_errors.append("Project 'name' exceeds maximum npm limit of 214 characters.")
        elif not PACKAGE_NAME_REGEX.match(name_val.strip()):
            warnings.append(f"Project name '{name_val}' uses non-standard npm formatting.")

        # Dependency sections evaluation
        dep_sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
        total_direct_deps = 0

        for sec in dep_sections:
            if sec in manifest_data:
                sec_val = manifest_data[sec]
                if not isinstance(sec_val, dict):
                    hard_errors.append(f"Section '{sec}' must be a dictionary mapping package names to versions.")
                    continue

                for dep_name, ver_spec in sec_val.items():
                    total_direct_deps += 1

                    # Dangerous key
                    if dep_name in DANGEROUS_KEYS:
                        hard_errors.append(f"Dangerous key '{dep_name}' found in '{sec}'.")

                    # Dep name validation
                    if not dep_name or not isinstance(dep_name, str):
                        hard_errors.append(f"Invalid package name '{dep_name}' in '{sec}'.")
                    elif len(dep_name) > 214:
                        hard_errors.append(f"Package name '{dep_name[:30]}...' in '{sec}' exceeds 214 characters.")
                    elif not PACKAGE_NAME_REGEX.match(dep_name):
                        hard_errors.append(f"Package name '{dep_name}' contains illegal characters or path separators.")

                    # Version spec validation & suspicious sources
                    if ver_spec is None:
                        warnings.append(f"Package '{dep_name}' in '{sec}' has null version constraint.")
                    elif not isinstance(ver_spec, (str, int, float)):
                        hard_errors.append(f"Version constraint for '{dep_name}' in '{sec}' must be a string.")
                    else:
                        ver_str = str(ver_spec).strip()
                        if ver_str in ("*", "latest", ""):
                            warnings.append(f"Package '{dep_name}' uses unpinned wildcard version '{ver_str or 'empty'}'.")
                        elif ver_str.startswith(("git+", "git://", "github:", "git@")):
                            warnings.append(f"Package '{dep_name}' uses external git repository source '{ver_str}'.")
                        elif ver_str.startswith("http://"):
                            warnings.append(f"Package '{dep_name}' uses insecure plain HTTP dependency source '{ver_str}'.")
                        elif ver_str.startswith(("file:", "link:", "../", "./", "/")):
                            warnings.append(f"Package '{dep_name}' references local filesystem path '{ver_str}'.")
                        elif re.search(r"https?://.*?\.(tgz|tar\.gz)", ver_str, re.IGNORECASE):
                            warnings.append(f"Package '{dep_name}' references remote tarball archive.")

        if total_direct_deps > MAX_PACKAGE_JSON_DIRECT_DEPS:
            hard_errors.append(
                f"package.json exceeds maximum allowed direct dependencies limit of {MAX_PACKAGE_JSON_DIRECT_DEPS} (found {total_direct_deps})."
            )

        # Lifecycle scripts check
        scripts_val = manifest_data.get("scripts")
        if isinstance(scripts_val, dict):
            for s_name, s_cmd in scripts_val.items():
                if s_name in DANGEROUS_KEYS:
                    hard_errors.append(f"Dangerous key '{s_name}' found in 'scripts'.")
                if s_name.lower() in SUSPICIOUS_LIFECYCLE_SCRIPTS:
                    warnings.append(f"Manifest defines lifecycle install script '{s_name}'.")
                if isinstance(s_cmd, str) and SUSPICIOUS_COMMAND_PATTERNS.search(s_cmd):
                    warnings.append(f"Script '{s_name}' contains potentially hazardous shell command pattern.")

    else:
        # -------------------------------------------------------------
        # package-lock.json validation (Limits: 10,000 pkgs, 50 MB)
        # -------------------------------------------------------------
        lock_version = manifest_data.get("lockfileVersion")
        if lock_version not in (1, 2, 3):
            hard_errors.append(
                f"Unsupported package-lock.json lockfileVersion: {lock_version}. Supported versions are 1, 2, and 3."
            )

        pkg_count = 0
        if "packages" in manifest_data and isinstance(manifest_data["packages"], dict):
            pkg_dict = manifest_data["packages"]
            pkg_count += len(pkg_dict)
            for k in pkg_dict.keys():
                if k in DANGEROUS_KEYS:
                    hard_errors.append(f"Dangerous key '{k}' detected in lockfile packages.")
        elif "dependencies" in manifest_data and isinstance(manifest_data["dependencies"], dict):
            dep_dict = manifest_data["dependencies"]
            pkg_count += len(dep_dict)
            for k in dep_dict.keys():
                if k in DANGEROUS_KEYS:
                    hard_errors.append(f"Dangerous key '{k}' detected in lockfile dependencies.")

        if pkg_count > MAX_LOCKFILE_PACKAGES:
            hard_errors.append(
                f"package-lock.json exceeds maximum package limit of {MAX_LOCKFILE_PACKAGES} (contains {pkg_count} packages)."
            )

    return hard_errors, warnings


# =============================================================================
# 4. Token Scrubbing & Safe Redirect Execution
# =============================================================================

# Known GitHub token formats: ghp_, gho_, ghu_, ghs_, ghr_, github_pat_ followed by token characters
_KNOWN_GH_TOKEN_PATTERN = re.compile(
    r"\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{16,}\b|\bgithub_pat_[a-zA-Z0-9_]{16,}\b"
)

# Authorization header credentials (Bearer <token> or token <token>)
# ONLY matches when the value looks like a credential (at least 16 chars, no spaces)
_AUTH_HEADER_CREDENTIAL_PATTERN = re.compile(
    r"(\b(?:Bearer|token)\s+)([a-zA-Z0-9_\-\.]{16,})\b",
    re.IGNORECASE
)

def scrub_sensitive_tokens(message: str, token: Optional[str] = None) -> str:
    """
    Scrubs GitHub tokens, authorization headers, and bearer credentials from error and log messages.

    Guarantees:
    (a) Redacts the exact token value supplied in the request (if provided and at least 6 chars).
    (b) Redacts known GitHub token formats (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_ followed by token characters).
    (c) Redacts the value after 'Bearer ' or 'token ' ONLY when that value looks like a credential (long, no spaces).
    - Preserves ordinary words and case intact (e.g. 'token of appreciation', 'Personal Access Token', 'GITHUB_TOKEN').
    """
    if not message or not isinstance(message, str):
        return message or ""

    cleaned = message

    # (a) Exact token value supplied in request
    if token and isinstance(token, str):
        raw_token = token.strip()
        if len(raw_token) >= 6:
            cleaned = cleaned.replace(raw_token, "[REDACTED_TOKEN]")

    # (b) Known GitHub token formats
    cleaned = _KNOWN_GH_TOKEN_PATTERN.sub("[REDACTED_TOKEN]", cleaned)

    # (c) Credential value after 'Bearer ' or 'token '
    cleaned = _AUTH_HEADER_CREDENTIAL_PATTERN.sub(r"\1[REDACTED_TOKEN]", cleaned)

    return cleaned


# Alias for backward-compatibility with log sanitizer callers
sanitize_log_message = scrub_sensitive_tokens
