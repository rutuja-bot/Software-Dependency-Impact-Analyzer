import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import requests
from fastapi.testclient import TestClient

from app.main import app
from app.security.osv_service import OsvSecurityService
from app.analyzers.freshness_service import LibYearFreshnessService

client = TestClient(app)

# =========================================================================
# 1. OSV VULNERABILITY INTEGRATION TESTS (8 Requirements)
# =========================================================================

def test_osv_vulnerability_found_mocked():
    """1. A package with a vulnerability returned by a mocked OSV response."""
    service = OsvSecurityService()
    mock_payload = {
        "vulns": [
            {
                "id": "GHSA-1234-abcd",
                "summary": "Prototype Pollution in test-lib",
                "details": "A prototype pollution flaw was discovered in test-lib.",
                "published": "2023-01-15T00:00:00Z",
                "modified": "2023-02-01T00:00:00Z",
                "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"}],
                "affected": [
                    {
                        "package": {"name": "test-lib", "ecosystem": "npm"},
                        "ranges": [
                            {
                                "type": "SEMVER",
                                "events": [
                                    {"introduced": "0"},
                                    {"fixed": "1.2.3"}
                                ]
                            }
                        ]
                    }
                ],
                "references": [
                    {"type": "ADVISORY", "url": "https://github.com/advisories/GHSA-1234-abcd"}
                ]
            }
        ]
    }

    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload
        mock_post.return_value = mock_resp

        result = service.query_package("test-lib", "1.2.0")
        assert result.status == "vulnerable"
        assert len(result.vulnerabilities) == 1
        vuln = result.vulnerabilities[0]
        assert vuln.id == "GHSA-1234-abcd"
        assert vuln.summary == "Prototype Pollution in test-lib"
        assert "CVSS:3.1" in vuln.severity
        assert vuln.fixed_versions == ["1.2.3"]
        assert len(vuln.references) == 1
        assert vuln.references[0].url == "https://github.com/advisories/GHSA-1234-abcd"

def test_osv_multi_package_affected_isolation():
    """Verify that fixed versions from a different affected package in the same advisory are ignored."""
    service = OsvSecurityService()
    multi_affected_payload = {
        "vulns": [
            {
                "id": "GHSA-multi-test",
                "summary": "Shared advisory affecting pkg-a and other-pkg",
                "affected": [
                    {
                        "package": {"name": "pkg-a", "ecosystem": "npm"},
                        "ranges": [
                            {"type": "SEMVER", "events": [{"introduced": "0"}, {"fixed": "2.0.0"}]}
                        ]
                    },
                    {
                        "package": {"name": "other-pkg", "ecosystem": "npm"},
                        "ranges": [
                            {"type": "SEMVER", "events": [{"introduced": "0"}, {"fixed": "9.9.9"}]}
                        ]
                    }
                ]
            }
        ]
    }

    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = multi_affected_payload
        mock_post.return_value = mock_resp

        res = service.query_package("pkg-a", "1.0.0")
        assert res.status == "vulnerable"
        assert len(res.vulnerabilities) == 1
        # Must only include "2.0.0", NOT "9.9.9"
        assert res.vulnerabilities[0].fixed_versions == ["2.0.0"]


def test_osv_clean_package_mocked():
    """2. A package with no vulnerability returned (empty vulns array 200 OK)."""
    service = OsvSecurityService()
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"vulns": []}
        mock_post.return_value = mock_resp

        result = service.query_package("clean-pkg", "2.0.0")
        assert result.status == "clean"
        assert len(result.vulnerabilities) == 0

def test_osv_404_produces_error_state():
    """OSV 404 produces an error state rather than false-negative clean."""
    service = OsvSecurityService()
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "Not found"
        mock_post.return_value = mock_resp

        result = service.query_package("nonexistent-pkg", "1.0.0")
        assert result.status == "error"
        assert "404" in result.error_message

def test_osv_missing_or_loose_version():
    """3. Missing version or loose constraint rejection without querying OSV."""
    service = OsvSecurityService()
    # Loose range constraint
    res_range = service.query_package("lodash", "^4.17.20")
    assert res_range.status == "unresolved"
    assert "loose range constraint" in res_range.error_message

    # Batch scan with missing version
    batch_res = service.scan_packages([{"name": "missing-ver-pkg", "version": ""}])
    assert batch_res.unresolved_packages_count == 1
    assert "missing-ver-pkg" in batch_res.unresolved_packages
    assert batch_res.results[0].status == "unresolved"

def test_osv_timeout_and_connection_failure():
    """4. API timeout and connection failure handling without crashing."""
    service = OsvSecurityService()
    with patch("requests.post", side_effect=requests.exceptions.Timeout("Connection timed out")):
        res_timeout = service.query_package("slow-pkg", "1.0.0")
        assert res_timeout.status == "error"
        assert "timed out" in res_timeout.error_message

    with patch("requests.post", side_effect=requests.exceptions.ConnectionError("Network down")):
        res_conn = service.query_package("offline-pkg", "1.0.0")
        assert res_conn.status == "error"
        assert "connection error" in res_conn.error_message

def test_osv_rate_limiting_or_unsuccessful_http():
    """5. Rate limiting (HTTP 429) or server errors (HTTP 500)."""
    service = OsvSecurityService()
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.text = "Rate limit exceeded"
        mock_post.return_value = mock_resp

        result = service.query_package("pkg", "1.0.0")
        assert result.status == "error"
        assert "429" in result.error_message

def test_osv_malformed_json_response():
    """6. Malformed external API data."""
    service = OsvSecurityService()
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("Invalid JSON token")
        mock_post.return_value = mock_resp

        result = service.query_package("pkg", "1.0.0")
        assert result.status == "error"
        assert "Failed to parse OSV response" in result.error_message

def test_osv_missing_optional_severity_and_fixed_versions():
    """7. Missing optional severity or fixed-version fields parsed safely."""
    service = OsvSecurityService()
    minimal_payload = {
        "vulns": [
            {
                "id": "CVE-2024-9999",
                "summary": "Minor vulnerability without CVSS or fixed ranges"
            }
        ]
    }
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = minimal_payload
        mock_post.return_value = mock_resp

        result = service.query_package("pkg-x", "1.0.0")
        assert result.status == "vulnerable"
        vuln = result.vulnerabilities[0]
        assert vuln.id == "CVE-2024-9999"
        assert vuln.severity is None
        assert vuln.fixed_versions == []

def test_osv_partial_scan_failure():
    """8. Partial scan failure while other packages still receive results."""
    service = OsvSecurityService()
    def mock_post_side_effect(url, **kwargs):
        payload = kwargs.get("json", {})
        pkg_name = payload.get("package", {}).get("name")
        mock_resp = MagicMock()
        if pkg_name == "failing-pkg":
            mock_resp.status_code = 500
            mock_resp.text = "Internal error"
        else:
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"vulns": []}
        return mock_resp

    with patch("requests.post", side_effect=mock_post_side_effect):
        batch = [
            {"name": "good-pkg", "version": "1.0.0"},
            {"name": "failing-pkg", "version": "1.0.0"}
        ]
        res = service.scan_packages(batch)
        assert res.status == "partial"
        assert res.clean_packages_count == 1
        assert res.unresolved_packages_count == 1
        assert "failing-pkg" in res.unresolved_packages

# =========================================================================
# 2. LIBYEAR FRESHNESS ANALYSIS TESTS (6 Requirements)
# =========================================================================

def test_libyear_correct_calculation_known_date():
    """9. Correct LibYear calculation for a known release date (e.g. exactly 2 years old)."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)
    # Released exactly 2 years earlier (2 * 365.25 days = 730.5 days)
    release_date = datetime(2024, 10, 13, 0, 0, 0, tzinfo=timezone.utc).isoformat()

    res = service.calculate_libyear("pkg-a", "1.0.0", analysis_date, custom_release_date=release_date)
    assert res.status == "scored"
    # ~2.00 years
    assert 1.99 <= res.libyear <= 2.01

def test_libyear_zero_for_current_or_future_date():
    """10. Zero LibYears for a future or current release date."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)
    future_date = datetime(2026, 12, 1, 0, 0, 0, tzinfo=timezone.utc).isoformat()

    res = service.calculate_libyear("brand-new-pkg", "1.0.0", analysis_date, custom_release_date=future_date)
    assert res.status == "scored"
    assert res.libyear == 0.0

def test_libyear_missing_release_date():
    """11. Missing release date reports unscored with reason."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)
    with patch.object(service, "fetch_package_release_dates", return_value={}):
        res = service.calculate_libyear("rare-pkg", "1.0.0", analysis_date)
        assert res.status == "unscored"
        assert res.libyear is None
        assert "not found in registry" in res.reason_unscored

def test_libyear_invalid_or_missing_installed_version():
    """12. Invalid version or missing installed version."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)
    # Missing version
    res_none = service.calculate_libyear("pkg-x", None, analysis_date)
    assert res_none.status == "unscored"
    assert "Missing or unverified" in res_none.reason_unscored

    # Loose version constraint
    res_loose = service.calculate_libyear("pkg-x", "^2.0.0", analysis_date)
    assert res_loose.status == "unscored"
    assert "loose range constraint" in res_loose.reason_unscored

def test_libyear_project_total_and_average_calculations():
    """13. Correct project-level total and average calculations."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)

    # 3 packages:
    # pkg1: 1.00 year old
    # pkg2: 3.00 years old
    # Total = 4.00, Avg = 2.00
    date_pkg1 = datetime(2025, 10, 13, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    date_pkg2 = datetime(2023, 10, 13, 0, 0, 0, tzinfo=timezone.utc).isoformat()

    release_map = {
        "pkg1@1.0.0": date_pkg1,
        "pkg2@1.0.0": date_pkg2
    }

    packages = [
        {"name": "pkg1", "version": "1.0.0"},
        {"name": "pkg2", "version": "1.0.0"}
    ]

    res = service.analyze_freshness(packages, analysis_date=analysis_date, release_dates_map=release_map)
    assert res.total_packages == 2
    assert res.scored_packages_count == 2
    assert 3.98 <= res.project_total_libyear <= 4.02
    assert 1.98 <= res.project_average_libyear <= 2.02

def test_libyear_exclusion_of_unscored_from_average():
    """14. Exclusion of unscored packages from average denominator."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)

    # 2 packages, but only 1 has a release date (2.0 years old)
    date_pkg1 = datetime(2024, 10, 13, 0, 0, 0, tzinfo=timezone.utc).isoformat()
    release_map = {"pkg1@1.0.0": date_pkg1}

    packages = [
        {"name": "pkg1", "version": "1.0.0"},
        {"name": "unscored-pkg", "version": "1.0.0"}
    ]

    with patch.object(service, "fetch_package_release_dates", return_value={}):
        res = service.analyze_freshness(packages, analysis_date=analysis_date, release_dates_map=release_map)
        assert res.total_packages == 2
        assert res.scored_packages_count == 1
        assert res.unscored_packages_count == 1
        assert "unscored-pkg" in res.unscored_packages
        # Average must be 2.0 / 1 = 2.0, NOT 2.0 / 2 = 1.0!
        assert 1.98 <= res.project_average_libyear <= 2.02

def test_libyear_installed_version_exact_date_not_latest():
    """Verify that the installed version release date is used, never the latest version release date."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 10, 13, 0, 0, 0, tzinfo=timezone.utc)

    registry_times = {
        "1.0.0": "2024-10-13T00:00:00Z",
        "2.0.0": "2026-09-01T00:00:00Z"
    }

    with patch.object(service, "fetch_package_release_dates", return_value=registry_times):
        res = service.calculate_libyear("multi-ver-pkg", "1.0.0", analysis_date)
        assert res.status == "scored"
        assert res.version == "1.0.0"
        assert 1.99 <= res.libyear <= 2.01

def test_libyear_exact_365_25_day_formula():
    """Verify exact 365.25 day year convention for leap-year consistency."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    rel_dt = datetime.fromtimestamp(analysis_date.timestamp() - 31557600, tz=timezone.utc)
    res = service.calculate_libyear("leap-pkg", "1.0.0", analysis_date, custom_release_date=rel_dt.isoformat())
    assert res.status == "scored"
    assert res.libyear == 1.00

# =========================================================================
# 3. END-TO-END API TESTS
# =========================================================================

def test_api_security_and_freshness_endpoints():
    """Integration test testing POST /api/security/scan and POST /api/freshness/analyze."""
    payload = {
        "package_json": {"name": "sec-demo", "dependencies": {"express": "4.18.2"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"express": "4.18.2"}},
                "node_modules/express": {"version": "4.18.2", "dependencies": {}}
            }
        }
    }
    # Analyze first
    res_init = client.post("/api/analyze", json=payload)
    assert res_init.status_code == 200

    # Scan security with mocked OSV
    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"vulns": []}
        mock_post.return_value = mock_resp

        sec_res = client.post("/api/security/scan")
        assert sec_res.status_code == 200
        sec_data = sec_res.json()
        assert sec_data["total_packages_checked"] == 1
        assert sec_data["clean_packages_count"] == 1

    # Check freshness with mocked npm registry
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"time": {"4.18.2": "2022-10-08T00:00:00Z"}}
        mock_get.return_value = mock_resp

        fresh_res = client.post("/api/freshness/analyze")
        assert fresh_res.status_code == 200
        fresh_data = fresh_res.json()
        assert fresh_data["total_packages"] == 1
        assert fresh_data["scored_packages_count"] == 1
        assert fresh_data["project_total_libyear"] > 0


def test_libyear_concurrent_prefetch():
    """Verify concurrent prefetching fetches multiple uncached packages."""
    service = LibYearFreshnessService()
    mock_responses = {
        "https://registry.npmjs.org/pkg-alpha": {"time": {"1.0.0": "2024-01-01T00:00:00Z"}},
        "https://registry.npmjs.org/pkg-beta": {"time": {"2.0.0": "2024-06-01T00:00:00Z"}},
    }

    def mock_fetch(url, **kwargs):
        resp = MagicMock()
        if url in mock_responses:
            resp.status_code = 200
            resp.json.return_value = mock_responses[url]
        else:
            resp.status_code = 404
        return resp

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [
            {"name": "pkg-alpha", "version": "1.0.0"},
            {"name": "pkg-beta", "version": "2.0.0"},
            {"name": "pkg-gamma", "version": "^3.0.0"}  # Should be skipped from prefetch
        ]
        res = service.analyze_freshness(packages)
        assert res.total_packages == 3
        assert res.scored_packages_count == 2
        assert res.unscored_packages_count == 1
        assert "pkg-gamma" in res.unscored_packages
        assert "pkg-alpha" in service._cache
        assert "pkg-beta" in service._cache
        assert "pkg-gamma" not in service._cache


def test_libyear_registry_timeout_handling():
    """Verify registry timeout is explicitly handled per-package and does not crash batch."""
    service = LibYearFreshnessService(timeout_seconds=1.0)

    def mock_fetch(url, **kwargs):
        if "timeout-pkg" in url:
            raise requests.exceptions.Timeout("Read timed out")
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"time": {"1.0.0": "2024-01-01T00:00:00Z"}}
        return resp

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [
            {"name": "good-pkg", "version": "1.0.0"},
            {"name": "timeout-pkg", "version": "1.0.0"}
        ]
        res = service.analyze_freshness(packages)
        assert res.total_packages == 2
        assert res.scored_packages_count == 1
        assert res.unscored_packages_count == 1
        assert "timeout-pkg" in res.unscored_packages

        timed_out = next(r for r in res.results if r.package_name == "timeout-pkg")
        assert timed_out.status == "unscored"
        assert "timed out" in timed_out.reason_unscored


def test_libyear_registry_404_handling():
    """Verify missing package (HTTP 404) is marked unscored with explicit reason."""
    service = LibYearFreshnessService()

    def mock_fetch(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 404
        return resp

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [{"name": "private-pkg", "version": "1.0.0"}]
        res = service.analyze_freshness(packages)
        assert res.total_packages == 1
        assert res.scored_packages_count == 0
        assert res.unscored_packages_count == 1
        assert "HTTP 404" in res.results[0].reason_unscored


def test_api_freshness_persistence_and_retrieval():
    """Integration test checking that /api/freshness/analyze persists records retrievable via /api/analyses/{id}/freshness."""
    payload = {
        "package_json": {"name": "freshness-persist-test", "dependencies": {"pkg-x": "1.0.0"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"pkg-x": "1.0.0"}},
                "node_modules/pkg-x": {"version": "1.0.0", "dependencies": {}}
            }
        }
    }
    # 1. Submit manifest
    res_analyze = client.post("/api/analyze", json=payload)
    assert res_analyze.status_code == 200

    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE, freshness_service
    analysis_id = _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"]

    # 2. Run freshness with mock registry response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"time": {"1.0.0": "2024-01-01T00:00:00Z"}}

    with patch.object(freshness_service._session, "get", return_value=mock_resp):
        res_fresh = client.post("/api/freshness/analyze")
        assert res_fresh.status_code == 200
        data = res_fresh.json()
        assert data["scored_packages_count"] == 1

    # 3. Retrieve persisted freshness records via /api/analyses/{id}/freshness
    if analysis_id:
        res_retrieved = client.get(f"/api/analyses/{analysis_id}/freshness")
        assert res_retrieved.status_code == 200
        ret_data = res_retrieved.json()
        assert ret_data["analysis_id"] == analysis_id
        assert ret_data["total_packages"] == 1
        assert ret_data["scored_packages_count"] == 1
        assert len(ret_data["records"]) == 1
        assert ret_data["records"][0]["package_name"] == "pkg-x"
        assert ret_data["records"][0]["status"] == "scored"


def test_api_security_persistence_and_retrieval():
    """Integration test checking that /api/security/scan persists records retrievable via /api/analyses/{id}/security."""
    payload = {
        "package_json": {"name": "security-persist-test", "dependencies": {"vuln-lib": "1.0.0"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"vuln-lib": "1.0.0"}},
                "node_modules/vuln-lib": {"version": "1.0.0", "dependencies": {}}
            }
        }
    }
    # 1. Submit manifest
    res_analyze = client.post("/api/analyze", json=payload)
    assert res_analyze.status_code == 200

    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE
    analysis_id = _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"]

    # 2. Run security scan with mocked OSV response
    mock_payload = {
        "vulns": [
            {
                "id": "GHSA-test-9999",
                "summary": "Remote Code Execution in vuln-lib",
                "details": "Critical flaw in vuln-lib.",
                "published": "2024-01-01T00:00:00Z",
                "modified": "2024-01-02T00:00:00Z",
                "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"}],
                "affected": [
                    {
                        "package": {"name": "vuln-lib", "ecosystem": "npm"},
                        "ranges": [{"type": "SEMVER", "events": [{"introduced": "0"}, {"fixed": "1.0.1"}]}]
                    }
                ],
                "references": [{"type": "ADVISORY", "url": "https://github.com/advisories/GHSA-test-9999"}]
            }
        ]
    }

    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload
        mock_post.return_value = mock_resp

        res_scan = client.post("/api/security/scan")
        assert res_scan.status_code == 200
        scan_data = res_scan.json()
        assert scan_data["total_packages_checked"] == 1
        assert scan_data["vulnerable_packages_count"] == 1
        assert scan_data["total_vulnerabilities_count"] == 1

    # 3. Retrieve persisted findings via /api/analyses/{id}/security
    if analysis_id:
        res_retrieved = client.get(f"/api/analyses/{analysis_id}/security")
        assert res_retrieved.status_code == 200
        ret_data = res_retrieved.json()
        assert ret_data["analysis_id"] == analysis_id
        assert ret_data["total_findings"] == 1
        assert ret_data["vulnerable_packages_count"] == 1
        finding = ret_data["findings"][0]
        assert finding["package_name"] == "vuln-lib"
        assert finding["package_version"] == "1.0.0"
        assert finding["vuln_id"] == "GHSA-test-9999"
        assert finding["summary"] == "Remote Code Execution in vuln-lib"
        assert "CVSS:3.1" in finding["severity"]
        assert finding["scan_status"] == "vulnerable"
        assert finding["fixed_versions"] == ["1.0.1"]

        # 4. Repeat scan and verify idempotency (no duplicate findings created)
        with patch("requests.post") as mock_post_2:
            mock_post_2.return_value = mock_resp
            res_repeat = client.post("/api/security/scan")
            assert res_repeat.status_code == 200

        res_retrieved_2 = client.get(f"/api/analyses/{analysis_id}/security")
        assert res_retrieved_2.status_code == 200
        ret_data_2 = res_retrieved_2.json()
        assert ret_data_2["total_findings"] == 1
        assert len(ret_data_2["findings"]) == 1


def test_api_security_scan_multi_finding_idempotency():
    """Verify repeated scan with multi-advisory and unresolved packages does not duplicate findings via API."""
    payload = {
        "package_json": {"name": "multi-sec-app", "dependencies": {"multi-lib": "1.0.0", "loose-lib": "^2.0.0"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"multi-lib": "1.0.0", "loose-lib": "^2.0.0"}},
                "node_modules/multi-lib": {"version": "1.0.0", "dependencies": {}}
            }
        }
    }
    res_analyze = client.post("/api/analyze", json=payload)
    assert res_analyze.status_code == 200

    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE
    analysis_id = _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"]

    mock_payload = {
        "vulns": [
            {"id": "GHSA-multi-1", "summary": "Vuln 1", "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/HIGH"}]},
            {"id": "GHSA-multi-2", "summary": "Vuln 2", "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/MEDIUM"}]}
        ]
    }

    with patch("requests.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_payload
        mock_post.return_value = mock_resp

        # First scan
        res_scan_1 = client.post("/api/security/scan")
        assert res_scan_1.status_code == 200

        # Repeated scan
        res_scan_2 = client.post("/api/security/scan")
        assert res_scan_2.status_code == 200

        if analysis_id:
            res_ret = client.get(f"/api/analyses/{analysis_id}/security")
            assert res_ret.status_code == 200
            data = res_ret.json()
            # 2 vulns for multi-lib + 1 unresolved for loose-lib = 3 findings total
            assert data["total_findings"] == 3
            vuln_ids = [f["vuln_id"] for f in data["findings"]]
            assert sorted(vuln_ids) == ["GHSA-multi-1", "GHSA-multi-2", "STATUS-UNRESOLVED"]


def test_libyear_distinguish_scored_failed_and_unresolved():
    """Verify LibYear clearly distinguishes scored, lookup_failed, and unresolved_version categories."""
    service = LibYearFreshnessService()

    def mock_fetch(url, **kwargs):
        if "timeout-pkg" in url:
            raise requests.exceptions.Timeout("Registry read timed out")
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"time": {"1.0.0": "2024-01-01T00:00:00Z"}}
        return resp

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [
            {"name": "scored-pkg", "version": "1.0.0"},
            {"name": "timeout-pkg", "version": "1.0.0"},
            {"name": "loose-pkg", "version": "^2.0.0"},
            {"name": "no-version-pkg", "version": None}
        ]
        res = service.analyze_freshness(packages)
        assert res.total_packages == 4
        assert res.scored_packages_count == 1
        assert res.unscored_packages_count == 3

        scored = next(r for r in res.results if r.package_name == "scored-pkg")
        assert scored.status == "scored"
        assert scored.category == "scored"
        assert scored.libyear is not None

        failed = next(r for r in res.results if r.package_name == "timeout-pkg")
        assert failed.status == "unscored"
        assert failed.category == "lookup_failed"
        assert failed.libyear is None
        assert "timeout-pkg" in res.failed_lookup_packages

        loose = next(r for r in res.results if r.package_name == "loose-pkg")
        assert loose.status == "unscored"
        assert loose.category == "unresolved_version"
        assert loose.libyear is None
        assert "loose-pkg" not in res.failed_lookup_packages

        no_ver = next(r for r in res.results if r.package_name == "no-version-pkg")
        assert no_ver.status == "unscored"
        assert no_ver.category == "unresolved_version"
        assert no_ver.libyear is None
        assert "no-version-pkg" not in res.failed_lookup_packages


def test_libyear_scoring_denominator_excludes_unscored_and_failed():
    """Verify denominator for average lag strictly excludes lookup_failed and unresolved_version."""
    service = LibYearFreshnessService()
    analysis_date = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    rel_date = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc).isoformat()

    release_map = {"pkg-valid@1.0.0": rel_date}

    def mock_fetch(url, **kwargs):
        raise requests.exceptions.Timeout("Timeout")

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [
            {"name": "pkg-valid", "version": "1.0.0"},
            {"name": "pkg-timeout", "version": "1.0.0"},
            {"name": "pkg-loose", "version": "^1.0.0"}
        ]
        res = service.analyze_freshness(packages, analysis_date=analysis_date, release_dates_map=release_map)
        assert res.total_packages == 3
        assert res.scored_packages_count == 1
        assert res.unscored_packages_count == 2
        # Exactly ~2.0 years
        assert 1.99 <= res.project_total_libyear <= 2.01
        # Average must be 2.0 / 1 = 2.0, NOT 2.0 / 3 = 0.67
        assert 1.99 <= res.project_average_libyear <= 2.01


def test_libyear_retry_failed_lookups_preserves_valid_results():
    """Verify retrying failed lookups preserves previously scored cached results."""
    service = LibYearFreshnessService()

    call_counts = {"pkg-good": 0, "pkg-flaky": 0}

    def mock_fetch(url, **kwargs):
        resp = MagicMock()
        if "pkg-good" in url:
            call_counts["pkg-good"] += 1
            resp.status_code = 200
            resp.json.return_value = {"time": {"1.0.0": "2024-01-01T00:00:00Z"}}
            return resp
        elif "pkg-flaky" in url:
            call_counts["pkg-flaky"] += 1
            if call_counts["pkg-flaky"] == 1:
                raise requests.exceptions.Timeout("Initial timeout")
            else:
                resp.status_code = 200
                resp.json.return_value = {"time": {"1.0.0": "2024-06-01T00:00:00Z"}}
                return resp
        resp.status_code = 404
        return resp

    with patch.object(service._session, "get", side_effect=mock_fetch):
        packages = [
            {"name": "pkg-good", "version": "1.0.0"},
            {"name": "pkg-flaky", "version": "1.0.0"}
        ]

        # First scan: pkg-good succeeds, pkg-flaky times out
        res1 = service.analyze_freshness(packages)
        assert res1.scored_packages_count == 1
        assert res1.unscored_packages_count == 1
        assert "pkg-flaky" in res1.failed_lookup_packages
        assert call_counts["pkg-good"] == 1
        assert call_counts["pkg-flaky"] == 1

        # Second scan with retry_failed=True
        res2 = service.analyze_freshness(packages, retry_failed=True)
        assert res2.scored_packages_count == 2
        assert res2.unscored_packages_count == 0
        assert len(res2.failed_lookup_packages) == 0
        # pkg-good was preserved from cache and NOT fetched again!
        assert call_counts["pkg-good"] == 1
        # pkg-flaky was re-fetched and succeeded
        assert call_counts["pkg-flaky"] == 2


def test_api_freshness_idempotent_persistence_and_retry():
    """Verify /api/freshness/analyze with retry_failed maintains idempotency and updates database records."""
    payload = {
        "package_json": {"name": "retry-fresh-app", "dependencies": {"pkg-a": "1.0.0"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"pkg-a": "1.0.0"}},
                "node_modules/pkg-a": {"version": "1.0.0", "dependencies": {}}
            }
        }
    }
    res_analyze = client.post("/api/analyze", json=payload)
    assert res_analyze.status_code == 200

    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE, freshness_service
    analysis_id = _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"time": {"1.0.0": "2024-01-01T00:00:00Z"}}

    with patch.object(freshness_service._session, "get", return_value=mock_resp):
        # 1. First freshness run
        res_fresh_1 = client.post("/api/freshness/analyze")
        assert res_fresh_1.status_code == 200

        # 2. Second freshness run with retry_failed=true
        res_fresh_2 = client.post("/api/freshness/analyze?retry_failed=true")
        assert res_fresh_2.status_code == 200

    if analysis_id:
        res_stored = client.get(f"/api/analyses/{analysis_id}/freshness")
        assert res_stored.status_code == 200
        stored_data = res_stored.json()
        # Verify no duplicate records created: exactly 1 record for pkg-a
        assert stored_data["total_packages"] == 1
        assert len(stored_data["records"]) == 1
        assert stored_data["records"][0]["package_name"] == "pkg-a"
        assert stored_data["records"][0]["status"] == "scored"




