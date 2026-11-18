import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import Request

from app.main import app
from app.core.config import settings
from app.core.rate_limiter import limiter
from app.parsers.nodejs import NodeJsManifestParser

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Resets in-memory rate limiter timestamps before and after each test."""
    limiter.reset()
    yield
    limiter.reset()

def test_rate_limiting_analyze_endpoint():
    client = TestClient(app)
    manifest = {
        "package_json": {"name": "test-pkg", "dependencies": {}}
    }
    with patch.object(settings, "RATE_LIMIT_ANALYZE", 2):
        # 1st request succeeds
        res1 = client.post("/api/analyze", json=manifest, headers={"X-Session-ID": "test-sess-1"})
        assert res1.status_code == 200

        # 2nd request succeeds
        res2 = client.post("/api/analyze", json=manifest, headers={"X-Session-ID": "test-sess-1"})
        assert res2.status_code == 200

        # 3rd request exceeds limit (HTTP 429)
        res3 = client.post("/api/analyze", json=manifest, headers={"X-Session-ID": "test-sess-1"})
        assert res3.status_code == 429
        assert "Rate limit exceeded" in res3.json()["detail"]
        assert "Retry-After" in res3.headers

def test_rate_limiting_client_ip_forwarded_for_not_trusted_by_default():
    client = TestClient(app)
    dummy_req = MagicMock(spec=Request)
    dummy_req.headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18"}
    dummy_req.client = MagicMock()
    dummy_req.client.host = "192.168.1.50"

    with patch.object(settings, "TRUST_PROXY_HEADERS", False):
        extracted = limiter.extract_client_ip(dummy_req)
        assert extracted == "192.168.1.50"

    with patch.object(settings, "TRUST_PROXY_HEADERS", True):
        extracted_trusted = limiter.extract_client_ip(dummy_req)
        assert extracted_trusted == "203.0.113.195"

def test_request_size_limit_middleware_rejects_oversized_content_length():
    client = TestClient(app)
    # Content-length exceeding 2 MiB
    headers = {"Content-Length": str(3 * 1024 * 1024), "Content-Type": "application/json"}
    res = client.post("/api/analyze", content=b"{}", headers=headers)
    assert res.status_code == 413
    assert "Payload too large" in res.json()["detail"]

def test_package_count_ceiling_rejection():
    large_deps = {f"pkg-{i}": "1.0.0" for i in range(450)}
    manifest_raw = {"name": "huge-project", "dependencies": large_deps}

    with patch.object(settings, "MAX_PACKAGE_COUNT", 400):
        with pytest.raises(ValueError, match="exceeds maximum allowed dependency limit"):
            NodeJsManifestParser.parse_package_json(manifest_raw)

def test_dependency_edge_ceiling_rejection():
    # 5 packages each declaring 10 dependencies = 50 edges, ceiling at 20
    lock_packages = {}
    for i in range(5):
        child_deps = {f"dep-{i}-{j}": "1.0.0" for j in range(10)}
        lock_packages[f"node_modules/pkg-{i}"] = {"version": "1.0.0", "dependencies": child_deps}

    manifest = NodeJsManifestParser.parse_package_json({"name": "dense-app", "dependencies": {}})
    lock_raw = {"lockfileVersion": 2, "packages": lock_packages}

    with patch.object(settings, "MAX_DEPENDENCY_EDGES", 20):
        with pytest.raises(ValueError, match="exceeds maximum allowed dependency relationships"):
            NodeJsManifestParser.parse_package_lock(lock_raw, manifest)

def test_multi_user_session_graph_isolation():
    """
    Simulates two distinct users with interleaved requests.
    Proves that User 1 never accesses User 2's graph and vice versa.
    """
    client = TestClient(app)

    # User 1 submits 'project-one'
    manifest_user1 = {
        "package_json": {"name": "project-one", "dependencies": {"dep-one": "1.0.0"}}
    }
    res1 = client.post("/api/analyze", json=manifest_user1, headers={"X-Session-ID": "user-session-1"})
    assert res1.status_code == 200

    # User 2 submits 'project-two'
    manifest_user2 = {
        "package_json": {"name": "project-two", "dependencies": {"dep-two": "2.0.0"}}
    }
    res2 = client.post("/api/analyze", json=manifest_user2, headers={"X-Session-ID": "user-session-2"})
    assert res2.status_code == 200

    # User 1 queries impact for dep-one -> should succeed and include project-one
    impact_user1 = client.get("/api/impact?target_package=dep-one", headers={"X-Session-ID": "user-session-1"})
    assert impact_user1.status_code == 200
    assert "project-one" in impact_user1.json()["affected_packages"]

    # User 2 queries impact for dep-one -> dep-one doesn't exist in project-two
    impact_user2_foreign = client.get("/api/impact?target_package=dep-one", headers={"X-Session-ID": "user-session-2"})
    assert impact_user2_foreign.status_code == 200
    assert "project-one" not in impact_user2_foreign.json()["affected_packages"]

    # User 2 queries impact for dep-two -> should succeed and include project-two
    impact_user2 = client.get("/api/impact?target_package=dep-two", headers={"X-Session-ID": "user-session-2"})
    assert impact_user2.status_code == 200
    assert "project-two" in impact_user2.json()["affected_packages"]

def test_external_osv_scan_batch_query_ceiling():
    from app.security.osv_service import OsvSecurityService
    from app.schemas.security import PackageSecurityResult

    service = OsvSecurityService()
    # 20 packages requested, but ceiling set to 5
    packages_to_scan = [{"name": f"pkg-{i}", "version": "1.0.0"} for i in range(20)]

    def mock_query(name, version):
        return PackageSecurityResult(package_name=name, version=version, status="clean", vulnerabilities=[])

    with patch.object(settings, "MAX_EXTERNAL_SCAN_PACKAGES", 5):
        with patch.object(service, "query_package", side_effect=mock_query):
            result = service.scan_packages(packages_to_scan)
            assert len(result.results) == 20
            # First 5 queried
            assert all(r.status == "clean" for r in result.results[:5])
            # Remaining 15 deferred
            assert all(r.status == "unresolved" for r in result.results[5:])
            assert "per-request batch limit" in result.results[5].error_message

def test_project_create_validation_safeguards():
    from app.api.routes.projects import require_repo
    mock_repo = MagicMock()
    app.dependency_overrides[require_repo] = lambda: mock_repo
    client = TestClient(app)
    try:
        # Empty name rejected
        res_empty = client.post("/api/projects", json={"name": "   ", "ecosystem": "npm"})
        assert res_empty.status_code == 400

        # Name > 255 rejected
        res_long_name = client.post("/api/projects", json={"name": "a" * 256, "ecosystem": "npm"})
        assert res_long_name.status_code == 400

        # Description > 2000 rejected
        res_long_desc = client.post("/api/projects", json={"name": "valid-name", "description": "d" * 2001})
        assert res_long_desc.status_code == 400
    finally:
        app.dependency_overrides.pop(require_repo, None)

def test_error_detail_redaction_on_unexpected_exception():
    client = TestClient(app)
    # Trigger an unexpected exception in an endpoint
    with patch("app.api.routes.analysis.DependencyGraphService.analyze_graph", side_effect=RuntimeError("internal_db_secret_key_12345")):
        res = client.post("/api/analyze", json={"package_json": {"name": "app", "dependencies": {}}})
        assert res.status_code == 500
        # Internal secret should never be revealed in response body
        assert "internal_db_secret_key_12345" not in res.text
        assert "An internal error occurred" in res.json()["detail"]
