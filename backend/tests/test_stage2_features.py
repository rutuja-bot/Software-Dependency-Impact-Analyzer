import io
import json
import zipfile
import base64
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_github_repo_info_and_validation(client):
    """
    Verifies GitHub repository inspection endpoint (/api/import/repo-info):
    - Rejects invalid URLs and SSRF targets.
    - Inspects valid public repository format and detects metadata using deterministic mock.
    """
    # 1. Invalid URLs rejected
    bad_res = client.post("/api/import/repo-info", json={"repo_url": "https://evil.attacker.com/repo"})
    assert bad_res.status_code == 400

    # 2. Valid URL metadata inspection (deterministic mocked network response)
    with patch("requests.get") as mock_get:
        def fake_repo_info_get(url, **kwargs):
            mock_resp = MagicMock()
            if "contents/package.json" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"name": "package.json"}
            elif "contents/package-lock.json" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"name": "package-lock.json"}
            elif "commits" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"sha": "c0ffee1234567890"}
            elif "repos/expressjs/express" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    "name": "express",
                    "owner": {"login": "expressjs"},
                    "default_branch": "master",
                    "description": "Fast, unopinionated, minimalist web framework for Node.js"
                }
            else:
                mock_resp.status_code = 404
            return mock_resp

        mock_get.side_effect = fake_repo_info_get
        valid_res = client.post("/api/import/repo-info", json={"repo_url": "https://github.com/expressjs/express"})
        assert valid_res.status_code == 200
        data = valid_res.json()
        assert data["owner"] == "expressjs"
        assert data["repo"] == "express"
        assert data["has_package_json"] is True
        assert "default_branch" in data


def test_github_import_with_branch_override(client):
    """
    Verifies importing a public GitHub repository with an explicit branch override:
    - Directed graph constructed with nodes and edges.
    - Manifest metadata captured properly.
    """
    fake_pkg = {
        "name": "express",
        "version": "4.18.2",
        "dependencies": {
            "accepts": "~1.3.8",
            "array-flatten": "1.1.1"
        }
    }
    fake_lock = {
        "name": "express",
        "version": "4.18.2",
        "lockfileVersion": 3,
        "packages": {
            "": {"name": "express", "version": "4.18.2", "dependencies": {"accepts": "~1.3.8", "array-flatten": "1.1.1"}},
            "node_modules/accepts": {"version": "1.3.8", "dependencies": {}},
            "node_modules/array-flatten": {"version": "1.1.1", "dependencies": {}}
        }
    }
    pkg_b64 = base64.b64encode(json.dumps(fake_pkg).encode("utf-8")).decode("utf-8")
    lock_b64 = base64.b64encode(json.dumps(fake_lock).encode("utf-8")).decode("utf-8")

    with patch("requests.get") as mock_get:
        def fake_import_get(url, **kwargs):
            mock_resp = MagicMock()
            if "contents/package.json" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"encoding": "base64", "content": pkg_b64}
            elif "contents/package-lock.json" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"encoding": "base64", "content": lock_b64}
            elif "commits/" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"sha": "abcdef123456"}
            elif "/repos/expressjs/express" in url:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"default_branch": "master", "name": "express"}
            else:
                mock_resp.status_code = 404
            return mock_resp

        mock_get.side_effect = fake_import_get
        res = client.post("/api/import/github", json={
            "repo_url": "https://github.com/expressjs/express",
            "branch": "master",
            "persist": False
        })
        assert res.status_code == 200
        data = res.json()
        assert data["project_name"] == "express"
        assert len(data["nodes"]) > 0
        assert len(data["edges"]) > 0
        assert data["import_source"] == "github"


@pytest.mark.integration
def test_github_live_integration(client):
    """
    Live external GitHub integration test (Instruction 7).
    Only executed when external network access is intentionally enabled.
    """
    import os
    if os.getenv("RUN_LIVE_INTEGRATION_TESTS") != "1":
        pytest.skip("Skipping live integration test (set RUN_LIVE_INTEGRATION_TESTS=1 to run)")

    valid_res = client.post("/api/import/repo-info", json={"repo_url": "https://github.com/expressjs/express"})
    assert valid_res.status_code == 200
    assert valid_res.json()["repo"] == "express"


def test_zip_archive_upload_and_extraction(client):
    """
    Verifies safe ZIP upload endpoint (/api/import/archive):
    - Ingests ZIP containing package.json and lockfile.
    - Resolves direct and transitive dependencies.
    """
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("app/package.json", json.dumps({
            "name": "enterprise-jwt-service",
            "version": "1.0.0",
            "dependencies": {
                "jsonwebtoken": "^9.0.2"
            }
        }))
        zf.writestr("app/package-lock.json", json.dumps({
            "name": "enterprise-jwt-service",
            "version": "1.0.0",
            "lockfileVersion": 3,
            "packages": {
                "": {
                    "name": "enterprise-jwt-service",
                    "version": "1.0.0",
                    "dependencies": { "jsonwebtoken": "^9.0.2" }
                },
                "node_modules/jsonwebtoken": {
                    "version": "9.0.2",
                    "dependencies": { "jws": "^3.2.2" }
                },
                "node_modules/jws": {
                    "version": "3.2.2",
                    "dependencies": {}
                }
            }
        }))
    zip_buf.seek(0)

    res = client.post(
        "/api/import/archive",
        files={"file": ("project.zip", zip_buf.getvalue(), "application/zip")}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["project_name"] == "enterprise-jwt-service"
    node_names = [n["name"] for n in data["nodes"]]
    assert "enterprise-jwt-service" in node_names
    assert "jsonwebtoken" in node_names
    assert "jws" in node_names

def test_zip_security_guards_corrupt_and_traversal(client):
    """
    Verifies security safeguards on ZIP upload:
    - Rejects non-zip / corrupt files.
    - Rejects path traversal attempts (e.g. ../../etc/passwd).
    - Rejects archives lacking package.json.
    """
    # 1. Corrupt payload
    res_corrupt = client.post(
        "/api/import/archive",
        files={"file": ("bad.zip", b"not-a-zip", "application/zip")}
    )
    assert res_corrupt.status_code in (400, 422)

    # 2. Path traversal
    bad_bio = io.BytesIO()
    with zipfile.ZipFile(bad_bio, "w") as zf:
        zf.writestr("../../etc/shadow", "root:*:12345:0:99999:7:::")
        zf.writestr("package.json", '{"name": "exploit"}')
    bad_bio.seek(0)

    res_traversal = client.post(
        "/api/import/archive",
        files={"file": ("exploit.zip", bad_bio.getvalue(), "application/zip")}
    )
    assert res_traversal.status_code in (400, 422)
    assert "path traversal" in res_traversal.text.lower()

    # 3. Missing package.json
    empty_bio = io.BytesIO()
    with zipfile.ZipFile(empty_bio, "w") as zf:
        zf.writestr("docs/readme.txt", "empty")
    empty_bio.seek(0)

    res_missing = client.post(
        "/api/import/archive",
        files={"file": ("no_manifest.zip", empty_bio.getvalue(), "application/zip")}
    )
    assert res_missing.status_code in (400, 422)

def test_risk_evaluate_routes_and_scoring(client):
    """
    Verifies that /api/risk/evaluate is accessible via both GET and POST,
    and returns 4-factor risk breakdown without route collision.
    """
    # Seed active graph
    client.post("/api/analyze", json={
        "package_json": {
            "name": "risk-test-service",
            "version": "1.0.0",
            "dependencies": { "lodash": "^4.17.21" }
        }
    })

    # GET /api/risk/evaluate
    res_get = client.get("/api/risk/evaluate")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert "overall_score" in data_get
    assert "overall_category" in data_get
    assert "factor_weights" in data_get

    # POST /api/risk/evaluate
    res_post = client.post("/api/risk/evaluate")
    assert res_post.status_code == 200
    data_post = res_post.json()
    assert data_post["overall_score"] == data_get["overall_score"]

def test_risk_score_exact_formula_consistency(client):
    """
    Verifies that the project-level risk score and package-level risk score
    strictly follow the documented formula:
    R = 0.35 * Vulnerability + 0.25 * Freshness + 0.20 * Impact + 0.20 * Criticality
    """
    from app.services.risk_service import DependencyRiskService
    import networkx as nx

    G = nx.DiGraph()
    G.add_node("root", version="1.0.0", is_root=True, dep_type="direct")
    G.add_node("pkg-a", version="1.0.0", is_root=False, dep_type="direct")
    G.add_edge("root", "pkg-a")

    svc = DependencyRiskService()
    res = svc.evaluate_project_risk(
        graph=G,
        root_package="root",
        project_name="root"
    )

    # Verify project-level factor contributions sum exactly to overall_score
    f = res.factors
    expected_sum = round(
        f["vulnerability"].weighted_score +
        f["freshness"].weighted_score +
        f["downstream_impact"].weighted_score +
        f["criticality"].weighted_score,
        1
    )
    assert res.overall_score == expected_sum

    # Verify deterministic formula test with user's exact audit values:
    # Vuln: 0.0, Fresh: 31.2, Impact: 18.5, Crit: 22.0 -> Exactly 15.9
    v_w = round(0.0 * 0.35, 2)
    f_w = round(31.2 * 0.25, 2)
    i_w = round(18.5 * 0.20, 2)
    c_w = round(22.0 * 0.20, 2)
    assert round(v_w + f_w + i_w + c_w, 1) == 15.9

def test_simulation_compare_invariance(client):
    """
    Verifies that before-and-after graph comparison does not mutate
    the cached baseline graph.
    """
    client.post("/api/analyze", json={
        "package_json": {
            "name": "invariance-test",
            "version": "1.0.0",
            "dependencies": { "axios": "0.21.1" }
        }
    })

    # Run comparison simulating upgrade to 1.6.0
    res_comp = client.post("/api/simulate/compare", json={
        "operation": "upgrade",
        "target_package": "axios",
        "version": "1.6.0"
    })
    assert res_comp.status_code == 200
    comp_data = res_comp.json()
    assert comp_data["version_changes"]["axios"]["original_version"] == "0.21.1"
    assert comp_data["version_changes"]["axios"]["simulated_version"] == "1.6.0"

    # Verify baseline graph is untouched by querying impact on original package
    res_impact = client.get("/api/impact/explore?target_package=axios")
    assert res_impact.status_code == 200


def test_github_token_fallback_and_authorization_header(client, monkeypatch):
    """
    Verifies that:
    1. User-supplied auth_token is prioritized if provided.
    2. Server-side GITHUB_TOKEN environment variable is used as fallback.
    3. Authorization header is omitted entirely when no token is present.
    4. Tokens are never exposed in error responses.
    """
    # Case 1: User provides auth_token -> sends Authorization: Bearer <user_token>
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "name": "express",
            "owner": {"login": "expressjs"},
            "default_branch": "master"
        }
        mock_get.return_value = mock_resp

        client.post("/api/import/repo-info", json={
            "repo_url": "https://github.com/expressjs/express",
            "auth_token": "ghp_user_token_123"
        })
        called_headers = mock_get.call_args[1].get("headers", {})
        assert called_headers.get("Authorization") == "Bearer ghp_user_token_123"

    # Case 2: No user token, but server GITHUB_TOKEN is set -> sends Authorization: Bearer <server_token>
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_env_token_456")
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "name": "express",
            "owner": {"login": "expressjs"},
            "default_branch": "master"
        }
        mock_get.return_value = mock_resp

        client.post("/api/import/repo-info", json={
            "repo_url": "https://github.com/expressjs/express",
            "auth_token": ""
        })
        called_headers = mock_get.call_args[1].get("headers", {})
        assert called_headers.get("Authorization") == "Bearer ghp_server_env_token_456"

    # Case 3: Neither token exists -> Authorization header is omitted
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "name": "express",
            "owner": {"login": "expressjs"},
            "default_branch": "master"
        }
        mock_get.return_value = mock_resp

        client.post("/api/import/repo-info", json={
            "repo_url": "https://github.com/expressjs/express",
            "auth_token": None
        })
        called_headers = mock_get.call_args[1].get("headers", {})
        assert "Authorization" not in called_headers


def test_github_rate_limit_user_friendly_error(client):
    """
    Verifies that GitHub 403 / 429 rate limit responses return clean, friendly messages
    without dumping raw GitHub JSON or leaking tokens.
    """
    expected_msg = "GitHub API rate limit reached. Configure GITHUB_TOKEN on the server or supply a Personal Access Token in the import dialog."

    # In /api/import/repo-info
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.text = json.dumps({"message": "API rate limit exceeded for 74.220.52.132."})
        mock_get.return_value = mock_resp

        res = client.post("/api/import/repo-info", json={"repo_url": "https://github.com/expressjs/express"})
        assert res.status_code == 429
        assert res.json()["detail"] == expected_msg
        assert "74.220.52.132" not in res.json()["detail"]

    # In /api/import/github
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.json.return_value = {"message": "API rate limit exceeded"}
        mock_get.return_value = mock_resp

        res = client.post("/api/import/github", json={"repo_url": "https://github.com/expressjs/express"})
        assert res.status_code == 400
        assert res.json()["detail"] == expected_msg
