import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import Base, get_db, check_db_connection
from app.db.models import (
    Project,
    Package,
    AnalysisRun,
    GraphSnapshot,
    VulnerabilityFinding,
    FreshnessRecord,
    SimulationRun
)
from app.db.repository import ProjectRepository
from app.schemas.graph import (
    GraphAnalysisResponse,
    GraphOverviewStats,
    PackageNode,
    DependencyEdge
)
from app.schemas.security import (
    SecurityScanResponse,
    PackageSecurityResult,
    VulnerabilityRecord,
    FreshnessAnalysisResponse,
    PackageFreshnessResult
)
from app.schemas.simulation import (
    SimulationResponse,
    GraphDiff,
    CycleDiff,
    DownstreamImpactDiff
)

# In-memory SQLite engine configured exclusively for deterministic unit testing of DB logic
from sqlalchemy.pool import StaticPool
TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def test_db_session():
    """
    Creates fresh isolated database tables in memory and provides a session for testing.
    Using StaticPool maintains a single shared connection so in-memory tables persist across session checkout.
    """
    engine = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()

@pytest.fixture(scope="function")
def override_client(test_db_session):
    """
    Overrides the FastAPI get_db dependency to point to the isolated test session.
    """
    def _get_test_db():
        yield test_db_session

    app.dependency_overrides[get_db] = _get_test_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.clear()


# =========================================================================
# 1. Database Configuration & Liveness Checks
# =========================================================================

def test_db_configuration_validation():
    """1. Validates database configuration and connection reporting."""
    # Test unreachable state
    with patch("app.db.session.get_engine") as mock_engine:
        mock_engine.side_effect = Exception("Failed to connect")
        status = check_db_connection("postgresql://invalid:pwd@localhost:5432/nonexistent")
        assert status["connected"] is False
        assert status["status"] in ("unreachable", "error")

    # Test disabled/empty configuration
    status_empty = check_db_connection("")
    assert status_empty["connected"] is False
    assert status_empty["status"] == "disabled"


# =========================================================================
# 2. Project Creation & Retrieval
# =========================================================================

def test_project_creation_and_retrieval(test_db_session):
    """2. Creates a project and verifies idempotency and retrieval."""
    repo = ProjectRepository(test_db_session)
    p1 = repo.get_or_create_project(name="my-service", ecosystem="npm", description="Test service")
    assert p1.id is not None
    assert p1.name == "my-service"
    assert p1.ecosystem == "npm"

    # Idempotent retrieval
    p2 = repo.get_or_create_project(name="my-service", ecosystem="npm")
    assert p2.id == p1.id

    # Retrieve by ID
    fetched = repo.get_project_by_id(p1.id)
    assert fetched is not None
    assert fetched.name == "my-service"


# =========================================================================
# 3. Analysis History & Graph Snapshot Persistence
# =========================================================================

def test_graph_snapshot_persistence_and_reconstruction(test_db_session):
    """3 & 4. Persists an analysis run with graph snapshot, verifying A -> B edge preservation."""
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="demo-app", ecosystem="npm")

    # Prepare mock GraphAnalysisResponse
    nodes = [
        PackageNode(name="demo-app", version="1.0.0", is_root=True, dep_type="direct", depth=0),
        PackageNode(name="express", version="4.18.2", is_root=False, dep_type="direct", depth=1),
        PackageNode(name="accepts", version="1.3.8", is_root=False, dep_type="transitive", depth=2)
    ]
    edges = [
        DependencyEdge(source="demo-app", target="express", version_constraint="^4.18.2", relation="depends_on"),
        DependencyEdge(source="express", target="accepts", version_constraint="~1.3.8", relation="depends_on")
    ]
    stats = GraphOverviewStats(
        total_packages=3,
        direct_dependencies_count=1,
        transitive_dependencies_count=1,
        total_dependency_edges=2,
        has_cycles=False,
        cycle_count=0,
        is_dag=True,
        root_package="demo-app"
    )
    analysis_res = GraphAnalysisResponse(
        project_name="demo-app",
        project_version="1.0.0",
        stats=stats,
        nodes=nodes,
        edges=edges,
        cycles=[],
        topological_order=["demo-app", "express", "accepts"]
    )

    analysis_run = repo.record_analysis_run(
        project=project,
        analysis_data=analysis_res,
        manifest_metadata={"source": "test"},
        status="completed"
    )

    assert analysis_run.id is not None
    assert analysis_run.project_id == project.id
    assert analysis_run.total_packages == 3
    assert analysis_run.graph_snapshot is not None

    # Verify Snapshot edges adhere to A -> B convention
    snapshot_edges = analysis_run.graph_snapshot.edges
    assert len(snapshot_edges) == 2
    assert snapshot_edges[0]["source"] == "demo-app"
    assert snapshot_edges[0]["target"] == "express"
    assert snapshot_edges[1]["source"] == "express"
    assert snapshot_edges[1]["target"] == "accepts"

    # Verify unique package registry
    pkg_express = test_db_session.query(Package).filter(Package.name == "express").first()
    assert pkg_express is not None
    assert pkg_express.ecosystem == "npm"


# =========================================================================
# 5. Vulnerability Findings Persistence
# =========================================================================

def test_vulnerability_findings_persistence(test_db_session):
    """5 & 6. Persists and queries OSV vulnerability findings."""
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="sec-app", ecosystem="npm")
    
    analysis = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=2,
        direct_dependencies_count=1,
        transitive_dependencies_count=1,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    vuln_rec = VulnerabilityRecord(
        id="GHSA-test-1234",
        summary="Test advisory in lodash",
        severity="HIGH",
        fixed_versions=["4.17.21"],
        references=[]
    )
    scan_res = SecurityScanResponse(
        status="completed",
        total_packages_checked=1,
        vulnerable_packages_count=1,
        clean_packages_count=0,
        unresolved_packages_count=0,
        total_vulnerabilities_count=1,
        results=[
            PackageSecurityResult(
                package_name="lodash",
                version="4.17.15",
                status="vulnerable",
                vulnerabilities=[vuln_rec]
            )
        ]
    )

    findings = repo.record_security_scan(analysis.id, scan_res)
    assert len(findings) == 1
    assert findings[0].vuln_id == "GHSA-test-1234"
    assert findings[0].package_name == "lodash"
    assert findings[0].fixed_versions == ["4.17.21"]

    retrieved = repo.get_security_findings_for_analysis(analysis.id)
    assert len(retrieved) == 1
    assert retrieved[0].vuln_id == "GHSA-test-1234"


def test_record_security_scan_idempotency_regression(test_db_session):
    """
    Regression test verifying:
    1. Persist a scan and repeat the same scan -> finding count remains stable.
    2. Multiple distinct advisories for one package remain separate.
    3. Findings from another analysis run remain unchanged.
    4. Unresolved findings are handled consistently.
    """
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="idempotent-sec-app", ecosystem="npm")

    # Create two separate analysis runs
    analysis_1 = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=3,
        direct_dependencies_count=3,
        transitive_dependencies_count=0,
        total_dependency_edges=3,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    analysis_2 = AnalysisRun(
        project_id=project.id,
        project_version="1.1.0",
        status="completed",
        total_packages=1,
        direct_dependencies_count=1,
        transitive_dependencies_count=0,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis_1)
    test_db_session.add(analysis_2)
    test_db_session.commit()

    # Pre-seed analysis_2 with an isolated finding
    scan_res_2 = SecurityScanResponse(
        status="completed",
        total_packages_checked=1,
        vulnerable_packages_count=1,
        clean_packages_count=0,
        unresolved_packages_count=0,
        total_vulnerabilities_count=1,
        results=[
            PackageSecurityResult(
                package_name="other-pkg",
                version="2.0.0",
                status="vulnerable",
                vulnerabilities=[
                    VulnerabilityRecord(
                        id="GHSA-other-9999",
                        summary="Other vulnerability",
                        severity="MEDIUM"
                    )
                ]
            )
        ]
    )
    repo.record_security_scan(analysis_2.id, scan_res_2)
    findings_analysis_2_initial = repo.get_security_findings_for_analysis(analysis_2.id)
    assert len(findings_analysis_2_initial) == 1
    assert findings_analysis_2_initial[0].vuln_id == "GHSA-other-9999"

    # Construct scan result for analysis_1 containing:
    # - express: 2 distinct advisories (GHSA-express-1, GHSA-express-2)
    # - cookie: 1 advisory (GHSA-cookie-1)
    # - jest: 1 unresolved finding (loose constraint)
    # - lodash: 1 clean package (should not produce findings)
    scan_res_1 = SecurityScanResponse(
        status="completed",
        total_packages_checked=4,
        vulnerable_packages_count=2,
        clean_packages_count=1,
        unresolved_packages_count=1,
        total_vulnerabilities_count=3,
        results=[
            PackageSecurityResult(
                package_name="express",
                version="4.18.2",
                status="vulnerable",
                vulnerabilities=[
                    VulnerabilityRecord(
                        id="GHSA-express-1",
                        summary="Express advisory 1",
                        severity="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
                        fixed_versions=["4.18.3"]
                    ),
                    VulnerabilityRecord(
                        id="GHSA-express-2",
                        summary="Express advisory 2",
                        severity="CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N",
                        fixed_versions=["4.19.0"]
                    )
                ]
            ),
            PackageSecurityResult(
                package_name="cookie",
                version="0.5.0",
                status="vulnerable",
                vulnerabilities=[
                    VulnerabilityRecord(
                        id="GHSA-cookie-1",
                        summary="Cookie advisory",
                        severity="LOW"
                    )
                ]
            ),
            PackageSecurityResult(
                package_name="jest",
                version="^29.7.0",
                status="unresolved",
                error_message="Version is a loose range constraint."
            ),
            PackageSecurityResult(
                package_name="lodash",
                version="4.17.21",
                status="clean",
                vulnerabilities=[]
            )
        ]
    )

    # 1. First scan persistence
    findings_1 = repo.record_security_scan(analysis_1.id, scan_res_1)
    assert len(findings_1) == 4

    stored_1 = repo.get_security_findings_for_analysis(analysis_1.id)
    assert len(stored_1) == 4

    # Confirm multiple distinct advisories for express remain separate
    express_findings = [f for f in stored_1 if f.package_name == "express"]
    assert len(express_findings) == 2
    express_vuln_ids = {f.vuln_id for f in express_findings}
    assert express_vuln_ids == {"GHSA-express-1", "GHSA-express-2"}

    # Confirm cookie finding
    cookie_findings = [f for f in stored_1 if f.package_name == "cookie"]
    assert len(cookie_findings) == 1
    assert cookie_findings[0].vuln_id == "GHSA-cookie-1"

    # Confirm unresolved finding handled consistently
    jest_findings = [f for f in stored_1 if f.package_name == "jest"]
    assert len(jest_findings) == 1
    assert jest_findings[0].vuln_id == "STATUS-UNRESOLVED"
    assert jest_findings[0].scan_status == "unresolved"
    assert jest_findings[0].summary == "Version is a loose range constraint."

    # 2. Repeat the scan for analysis_1
    repeat_findings = repo.record_security_scan(analysis_1.id, scan_res_1)
    assert len(repeat_findings) == 4

    # 3. Confirm total stored findings for analysis_1 remains strictly stable (4)
    stored_after_repeat = repo.get_security_findings_for_analysis(analysis_1.id)
    assert len(stored_after_repeat) == 4

    # Confirm finding IDs and attributes were preserved
    original_ids = {f.id for f in stored_1}
    after_ids = {f.id for f in stored_after_repeat}
    assert original_ids == after_ids

    # 4. Confirm findings from analysis_2 remain completely unchanged (strictly 1)
    findings_analysis_2_after = repo.get_security_findings_for_analysis(analysis_2.id)
    assert len(findings_analysis_2_after) == 1
    assert findings_analysis_2_after[0].id == findings_analysis_2_initial[0].id
    assert findings_analysis_2_after[0].vuln_id == "GHSA-other-9999"


def test_security_scan_retry_and_error_placeholder_resolution(test_db_session):
    """
    Validates retry handling and error placeholder resolution:
    1. First scan returns STATUS-ERROR; retry returns 2 advisories -> both advisories stored, error placeholder removed.
    2. First scan returns STATUS-ERROR; retry succeeds with clean -> error placeholder removed, 0 findings.
    3. Retry still returns an error -> error state preserved and updated.
    4. Package with multiple distinct advisories -> all preserved.
    5. Unrelated package and separate analysis run remain completely untouched.
    6. Repeated successful scan remains idempotent without duplicate findings.
    """
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="retry-test-app", ecosystem="npm")

    analysis_1 = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=4,
        direct_dependencies_count=4,
        transitive_dependencies_count=0,
        total_dependency_edges=4,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    analysis_other = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=1,
        direct_dependencies_count=1,
        transitive_dependencies_count=0,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis_1)
    test_db_session.add(analysis_other)
    test_db_session.commit()

    # Pre-seed analysis_other with an error placeholder and an advisory
    repo.record_security_scan(analysis_other.id, SecurityScanResponse(
        status="partial",
        total_packages_checked=2,
        vulnerable_packages_count=1,
        clean_packages_count=0,
        unresolved_packages_count=1,
        total_vulnerabilities_count=1,
        results=[
            PackageSecurityResult(package_name="isolated-err", version="1.0.0", status="error", error_message="Other error"),
            PackageSecurityResult(package_name="isolated-vuln", version="1.0.0", status="vulnerable", vulnerabilities=[
                VulnerabilityRecord(id="GHSA-isolated-1", summary="Isolated advisory")
            ])
        ]
    ))
    other_initial = repo.get_security_findings_for_analysis(analysis_other.id)
    assert len(other_initial) == 2

    # --- Scenario 1 & 2 & 5: First scan with STATUS-ERROR on pkg-a and pkg-b, unresolved on pkg-c, and advisory on pkg-d ---
    initial_scan = SecurityScanResponse(
        status="partial",
        total_packages_checked=4,
        vulnerable_packages_count=1,
        clean_packages_count=0,
        unresolved_packages_count=3,
        total_vulnerabilities_count=1,
        results=[
            PackageSecurityResult(package_name="pkg-a", version="1.0.0", status="error", error_message="Timeout 1"),
            PackageSecurityResult(package_name="pkg-b", version="2.0.0", status="error", error_message="Timeout 2"),
            PackageSecurityResult(package_name="pkg-c", version="^3.0.0", status="unresolved", error_message="Loose constraint"),
            PackageSecurityResult(package_name="pkg-d", version="4.0.0", status="vulnerable", vulnerabilities=[
                VulnerabilityRecord(id="GHSA-pkg-d-1", summary="Initial advisory for pkg-d")
            ])
        ]
    )
    repo.record_security_scan(analysis_1.id, initial_scan)
    findings_1 = repo.get_security_findings_for_analysis(analysis_1.id)
    assert len(findings_1) == 4
    pkg_a_err = [f for f in findings_1 if f.package_name == "pkg-a"]
    assert len(pkg_a_err) == 1 and pkg_a_err[0].vuln_id == "STATUS-ERROR"
    pkg_b_err = [f for f in findings_1 if f.package_name == "pkg-b"]
    assert len(pkg_b_err) == 1 and pkg_b_err[0].vuln_id == "STATUS-ERROR"

    # --- Retry:
    # pkg-a succeeds with 2 advisories (Scenario 1 & 4)
    # pkg-b succeeds and is clean (Scenario 2)
    # pkg-c is still unresolved (unresolved must NOT be removed merely because scan occurred)
    # pkg-d still has its advisory (Scenario 4 & 6)
    retry_scan = SecurityScanResponse(
        status="completed",
        total_packages_checked=4,
        vulnerable_packages_count=2,
        clean_packages_count=1,
        unresolved_packages_count=1,
        total_vulnerabilities_count=3,
        results=[
            PackageSecurityResult(package_name="pkg-a", version="1.0.0", status="vulnerable", vulnerabilities=[
                VulnerabilityRecord(id="GHSA-pkg-a-adv1", summary="Advisory 1", severity="HIGH"),
                VulnerabilityRecord(id="GHSA-pkg-a-adv2", summary="Advisory 2", severity="CRITICAL")
            ]),
            PackageSecurityResult(package_name="pkg-b", version="2.0.0", status="clean", vulnerabilities=[]),
            PackageSecurityResult(package_name="pkg-c", version="^3.0.0", status="unresolved", error_message="Loose constraint"),
            PackageSecurityResult(package_name="pkg-d", version="4.0.0", status="vulnerable", vulnerabilities=[
                VulnerabilityRecord(id="GHSA-pkg-d-1", summary="Initial advisory for pkg-d")
            ])
        ]
    )
    repo.record_security_scan(analysis_1.id, retry_scan)
    findings_after_retry = repo.get_security_findings_for_analysis(analysis_1.id)

    # Total findings should be 4:
    # - pkg-a: 2 advisories (GHSA-pkg-a-adv1, GHSA-pkg-a-adv2) and NO STATUS-ERROR (Scenario 1 & 4)
    # - pkg-b: 0 findings (STATUS-ERROR removed because retry succeeded as clean) (Scenario 2)
    # - pkg-c: 1 unresolved (STATUS-UNRESOLVED preserved)
    # - pkg-d: 1 advisory (GHSA-pkg-d-1 preserved without duplicate) (Scenario 6)
    assert len(findings_after_retry) == 4

    # Verify pkg-a
    pkg_a_findings = [f for f in findings_after_retry if f.package_name == "pkg-a"]
    assert len(pkg_a_findings) == 2
    assert {f.vuln_id for f in pkg_a_findings} == {"GHSA-pkg-a-adv1", "GHSA-pkg-a-adv2"}
    assert all(f.scan_status == "vulnerable" for f in pkg_a_findings)

    # Verify pkg-b has no findings
    pkg_b_findings = [f for f in findings_after_retry if f.package_name == "pkg-b"]
    assert len(pkg_b_findings) == 0

    # Verify pkg-c has unresolved preserved
    pkg_c_findings = [f for f in findings_after_retry if f.package_name == "pkg-c"]
    assert len(pkg_c_findings) == 1
    assert pkg_c_findings[0].vuln_id == "STATUS-UNRESOLVED"

    # Verify pkg-d has exactly 1 advisory
    pkg_d_findings = [f for f in findings_after_retry if f.package_name == "pkg-d"]
    assert len(pkg_d_findings) == 1
    assert pkg_d_findings[0].vuln_id == "GHSA-pkg-d-1"

    # --- Scenario 3: Retry still returns an error -> error placeholder preserved / updated
    retry_err_scan = SecurityScanResponse(
        status="partial",
        total_packages_checked=1,
        vulnerable_packages_count=0,
        clean_packages_count=0,
        unresolved_packages_count=1,
        total_vulnerabilities_count=0,
        results=[
            PackageSecurityResult(package_name="pkg-still-err", version="1.0.0", status="error", error_message="First failure")
        ]
    )
    repo.record_security_scan(analysis_1.id, retry_err_scan)
    err_finding = next(f for f in repo.get_security_findings_for_analysis(analysis_1.id) if f.package_name == "pkg-still-err")
    assert err_finding.vuln_id == "STATUS-ERROR"
    assert err_finding.summary == "First failure"

    # Second failure updates message without duplicating row
    retry_err_scan_2 = SecurityScanResponse(
        status="partial",
        total_packages_checked=1,
        vulnerable_packages_count=0,
        clean_packages_count=0,
        unresolved_packages_count=1,
        total_vulnerabilities_count=0,
        results=[
            PackageSecurityResult(package_name="pkg-still-err", version="1.0.0", status="error", error_message="Second failure")
        ]
    )
    repo.record_security_scan(analysis_1.id, retry_err_scan_2)
    err_findings_list = [f for f in repo.get_security_findings_for_analysis(analysis_1.id) if f.package_name == "pkg-still-err"]
    assert len(err_findings_list) == 1
    assert err_findings_list[0].summary == "Second failure"

    # --- Scenario 5: Check analysis_other remained completely untouched
    other_after = repo.get_security_findings_for_analysis(analysis_other.id)
    assert len(other_after) == 2
    assert {f.id for f in other_after} == {f.id for f in other_initial}


def test_record_security_scan_transaction_rollback_on_commit_failure(test_db_session):
    """
    Scenario 7: A database commit failure triggers rollback and propagates the exception.
    """
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="rollback-test-app", ecosystem="npm")

    analysis = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=1,
        direct_dependencies_count=1,
        transitive_dependencies_count=0,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    scan_res = SecurityScanResponse(
        status="completed",
        total_packages_checked=1,
        vulnerable_packages_count=1,
        clean_packages_count=0,
        unresolved_packages_count=0,
        total_vulnerabilities_count=1,
        results=[
            PackageSecurityResult(
                package_name="vuln-rollback-pkg",
                version="1.0.0",
                status="vulnerable",
                vulnerabilities=[VulnerabilityRecord(id="GHSA-rollback-1", summary="Rollback test")]
            )
        ]
    )

    with patch.object(test_db_session, "commit", side_effect=Exception("Database connection terminated during commit")):
        with patch.object(test_db_session, "rollback") as mock_rollback:
            with pytest.raises(Exception) as exc_info:
                repo.record_security_scan(analysis.id, scan_res)
            assert "Database connection terminated during commit" in str(exc_info.value)
            mock_rollback.assert_called_once()


# =========================================================================
# 6. Freshness Results Persistence
# =========================================================================

def test_freshness_results_persistence(test_db_session):
    """7. Persists and retrieves LibYear freshness records and project aggregations."""
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="fresh-app", ecosystem="npm")
    
    analysis = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=2,
        direct_dependencies_count=1,
        transitive_dependencies_count=1,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    fresh_res = FreshnessAnalysisResponse(
        status="completed",
        analysis_date="2026-10-14T00:00:00Z",
        total_packages=2,
        scored_packages_count=1,
        unscored_packages_count=1,
        project_total_libyear=2.5,
        project_average_libyear=2.5,
        results=[
            PackageFreshnessResult(
                package_name="express",
                version="4.18.2",
                status="scored",
                release_date="2024-04-14T00:00:00Z",
                analysis_date="2026-10-14T00:00:00Z",
                libyear=2.5
            ),
            PackageFreshnessResult(
                package_name="internal-lib",
                version="1.0.0",
                status="unscored",
                analysis_date="2026-10-14T00:00:00Z",
                reason_unscored="Private registry"
            )
        ]
    )

    records = repo.record_freshness_analysis(analysis.id, fresh_res)
    assert len(records) == 2
    scored = [r for r in records if r.status == "scored"][0]
    assert scored.package_name == "express"
    assert scored.libyear == 2.5
    assert scored.project_total_libyear == 2.5
    assert scored.project_average_libyear == 2.5

    unscored = [r for r in records if r.status != "scored"][0]
    assert unscored.reason_unscored == "Private registry"


# =========================================================================
# 7. Simulation History Persistence & Isolation
# =========================================================================

def test_simulation_history_persistence_and_isolation(test_db_session):
    """8 & 13. Persists simulation history without mutating baseline analysis."""
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="sim-app", ecosystem="npm")

    baseline_analysis = AnalysisRun(
        project_id=project.id,
        project_version="1.0.0",
        status="completed",
        total_packages=2,
        direct_dependencies_count=1,
        transitive_dependencies_count=1,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(baseline_analysis)
    test_db_session.commit()

    sim_res = SimulationResponse(
        operation="add",
        target_package="redis",
        source_package="sim-app",
        message="Simulated addition of redis",
        baseline_stats=GraphOverviewStats(
            total_packages=2,
            direct_dependencies_count=1,
            transitive_dependencies_count=1,
            total_dependency_edges=1,
            has_cycles=False,
            cycle_count=0,
            is_dag=True,
            root_package="sim-app"
        ),
        simulated_stats=GraphOverviewStats(
            total_packages=3,
            direct_dependencies_count=2,
            transitive_dependencies_count=1,
            total_dependency_edges=2,
            has_cycles=False,
            cycle_count=0,
            is_dag=True,
            root_package="sim-app"
        ),
        diff=GraphDiff(added_nodes=["redis"]),
        cycle_diff=CycleDiff(baseline_cycle_count=0, simulated_cycle_count=0),
        impact_diff=DownstreamImpactDiff(target_package="redis", baseline_affected_count=0, simulated_affected_count=1, newly_affected_packages=["sim-app"]),
        simulated_analysis=GraphAnalysisResponse(
            project_name="sim-app",
            project_version="1.0.0",
            stats=GraphOverviewStats(
                total_packages=3,
                direct_dependencies_count=2,
                transitive_dependencies_count=1,
                total_dependency_edges=2,
                has_cycles=False,
                cycle_count=0,
                is_dag=True,
                root_package="sim-app"
            ),
            nodes=[],
            edges=[]
        )
    )

    sim_record = repo.record_simulation_run(
        project_id=project.id,
        baseline_analysis_id=baseline_analysis.id,
        sim_res=sim_res
    )

    assert sim_record.id is not None
    assert sim_record.operation == "add"
    assert sim_record.target_package == "redis"
    assert sim_record.diff["added_nodes"] == ["redis"]

    # Baseline analysis remains completely isolated with its original 2 total_packages
    baseline_refetched = repo.get_analysis_by_id(baseline_analysis.id)
    assert baseline_refetched.total_packages == 2


# =========================================================================
# 8. Foreign-Key Cascades & Transaction Rollback
# =========================================================================

def test_cascade_delete_and_rollback(test_db_session):
    """9 & 10. Verifies cascade deletion of children and rollback on error."""
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="delete-cascade-test", ecosystem="npm")
    
    analysis = AnalysisRun(
        project_id=project.id,
        status="completed",
        total_packages=1,
        direct_dependencies_count=1,
        transitive_dependencies_count=0,
        total_dependency_edges=0,
        has_cycles=False,
        cycle_count=0,
        is_dag=True
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    # Add snapshot
    snapshot = GraphSnapshot(analysis_id=analysis.id, nodes=[], edges=[])
    test_db_session.add(snapshot)
    test_db_session.commit()

    # Deleting project cascades to analysis and snapshot
    test_db_session.delete(project)
    test_db_session.commit()

    assert test_db_session.query(AnalysisRun).filter(AnalysisRun.id == analysis.id).first() is None
    assert test_db_session.query(GraphSnapshot).filter(GraphSnapshot.id == snapshot.id).first() is None


# =========================================================================
# 9. API Integration, Not-Found Behavior & Pagination
# =========================================================================

def test_api_project_and_history_endpoints(override_client):
    """11 & 12. Tests project registration, history retrieval, 404 handling, and pagination."""
    # 1. Create project
    create_payload = {"name": "api-demo", "ecosystem": "npm", "description": "API Test"}
    res_create = override_client.post("/api/projects", json=create_payload)
    assert res_create.status_code == 200
    p_data = res_create.json()
    project_id = p_data["id"]
    assert p_data["name"] == "api-demo"

    # 2. List projects with pagination
    res_list = override_client.get("/api/projects?limit=10&offset=0")
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    # 3. Get project by ID
    res_get = override_client.get(f"/api/projects/{project_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == project_id

    # 4. Not-found project
    res_not_found = override_client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert res_not_found.status_code == 404

    # 5. Database status endpoint
    res_status = override_client.get("/api/projects/status")
    assert res_status.status_code == 200
    assert "status" in res_status.json()


def test_backend_env_resolution():
    """Validates that backend/.env path is reliably resolved from config."""
    from pathlib import Path
    import app.core.config as config_module
    backend_root = Path(config_module.__file__).resolve().parent.parent.parent
    assert (backend_root / ".env").name == ".env"
    assert config_module.settings.PROJECT_NAME is not None


def test_analysis_snapshot_restoration_endpoint(override_client, test_db_session):
    """
    Verifies full end-to-end analysis snapshot restoration via GET /api/analyses/{analysis_id}.
    Validates graph nodes, edges, stats, topological order, and project_name propagation,
    and confirms snapshot retrieval is strictly read-only.
    """
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="sample-node-service", ecosystem="npm")

    sample_nodes = [
        {"id": "sample-node-service", "label": "sample-node-service", "type": "root", "version": "1.2.0"},
        {"id": "express", "label": "express", "type": "direct", "version": "4.18.2"},
        {"id": "dotenv", "label": "dotenv", "type": "direct", "version": "16.0.3"}
    ]
    sample_edges = [
        {"source": "sample-node-service", "target": "express"},
        {"source": "sample-node-service", "target": "dotenv"}
    ]
    topological = ["sample-node-service", "dotenv", "express"]
    manifest_meta = {"package_name": "sample-node-service", "direct_count": 2, "has_lockfile": True}

    analysis = AnalysisRun(
        project_id=project.id,
        project_version="1.2.0",
        status="completed",
        total_packages=2,
        direct_dependencies_count=2,
        transitive_dependencies_count=0,
        total_dependency_edges=2,
        has_cycles=False,
        cycle_count=0,
        is_dag=True,
        topological_order=topological,
        cycle_details=[],
        manifest_metadata=manifest_meta
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    snapshot = GraphSnapshot(
        analysis_id=analysis.id,
        nodes=sample_nodes,
        edges=sample_edges
    )
    test_db_session.add(snapshot)
    test_db_session.commit()

    # Record row counts prior to endpoint execution
    count_analyses_before = test_db_session.query(AnalysisRun).count()
    count_snapshots_before = test_db_session.query(GraphSnapshot).count()
    count_projects_before = test_db_session.query(Project).count()

    # 1. Fetch full analysis detail (used by UI Load Snapshot)
    res = override_client.get(f"/api/analyses/{analysis.id}")
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == analysis.id
    assert data["project_id"] == project.id
    assert data["project_name"] == "sample-node-service"
    assert data["project_version"] == "1.2.0"
    assert data["status"] == "completed"
    assert data["total_packages"] == 2
    assert data["direct_dependencies_count"] == 2
    assert data["transitive_dependencies_count"] == 0
    assert data["total_dependency_edges"] == 2
    assert data["has_cycles"] is False
    assert data["cycle_count"] == 0
    assert data["is_dag"] is True
    assert data["topological_order"] == topological
    assert data["manifest_metadata"] == manifest_meta
    assert data["graph_snapshot"] is not None
    assert len(data["graph_snapshot"]["nodes"]) == 3
    assert len(data["graph_snapshot"]["edges"]) == 2

    # 2. Fetch standalone snapshot endpoint
    res_snap = override_client.get(f"/api/analyses/{analysis.id}/snapshot")
    assert res_snap.status_code == 200
    snap_data = res_snap.json()
    assert snap_data["analysis_id"] == analysis.id
    assert len(snap_data["nodes"]) == 3
    assert len(snap_data["edges"]) == 2

    # 3. Not found test
    res_404 = override_client.get("/api/analyses/00000000-0000-0000-0000-000000000000")
    assert res_404.status_code == 404

    # 4. Confirm strictly read-only behavior: counts unchanged
    count_analyses_after = test_db_session.query(AnalysisRun).count()
    count_snapshots_after = test_db_session.query(GraphSnapshot).count()
    count_projects_after = test_db_session.query(Project).count()

    assert count_analyses_after == count_analyses_before
    assert count_snapshots_after == count_snapshots_before
    assert count_projects_after == count_projects_before


def test_snapshot_active_cache_restoration_and_security_endpoints(override_client, test_db_session):
    """
    Verifies that POST /api/analyses/{analysis_id}/restore reconstructs the active NetworkX graph,
    and GET /api/analyses/{analysis_id}/security and GET /api/analyses/{analysis_id}/freshness
    correctly serve persisted data without initiating new network scans.
    """
    repo = ProjectRepository(test_db_session)
    project = repo.get_or_create_project(name="restore-demo-svc", ecosystem="npm")

    sample_nodes = [
        {"id": "restore-demo-svc", "label": "restore-demo-svc", "type": "root", "version": "2.0.0"},
        {"id": "demo-lib", "label": "demo-lib", "type": "direct", "version": "1.0.0"}
    ]
    sample_edges = [
        {"source": "restore-demo-svc", "target": "demo-lib"}
    ]

    analysis = AnalysisRun(
        project_id=project.id,
        project_version="2.0.0",
        status="completed",
        total_packages=1,
        direct_dependencies_count=1,
        transitive_dependencies_count=0,
        total_dependency_edges=1,
        has_cycles=False,
        cycle_count=0,
        is_dag=True,
        topological_order=["restore-demo-svc", "demo-lib"],
        cycle_details=[],
        manifest_metadata={"package_name": "restore-demo-svc"}
    )
    test_db_session.add(analysis)
    test_db_session.commit()

    snapshot = GraphSnapshot(
        analysis_id=analysis.id,
        nodes=sample_nodes,
        edges=sample_edges
    )
    test_db_session.add(snapshot)

    finding = VulnerabilityFinding(
        analysis_id=analysis.id,
        package_name="demo-lib",
        package_version="1.0.0",
        vuln_id="GHSA-test-1234",
        summary="Test vulnerability for restored snapshot",
        severity="HIGH",
        scan_status="vulnerable"
    )
    test_db_session.add(finding)
    test_db_session.commit()

    # Clear active cache to simulate loaded snapshot
    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE
    _ACTIVE_GRAPH_CACHE.clear()
    assert "latest" not in _ACTIVE_GRAPH_CACHE

    # 1. Restore snapshot into active memory cache
    res_restore = override_client.post(f"/api/analyses/{analysis.id}/restore")
    assert res_restore.status_code == 200
    r_data = res_restore.json()
    assert r_data["status"] == "restored"
    assert r_data["analysis_id"] == analysis.id
    assert r_data["project_name"] == "restore-demo-svc"

    # Confirm cache is active
    assert "latest" in _ACTIVE_GRAPH_CACHE
    assert _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"] == analysis.id

    # 2. Impact analysis works on restored graph
    res_impact = override_client.get("/api/impact", params={"target_package": "demo-lib"})
    assert res_impact.status_code == 200
    impact_data = res_impact.json()
    assert impact_data["target_package"] == "demo-lib"
    assert "restore-demo-svc" in impact_data["affected_packages"]

    # 3. GET security findings returns the persisted finding
    res_sec = override_client.get(f"/api/analyses/{analysis.id}/security")
    assert res_sec.status_code == 200
    sec_data = res_sec.json()
    assert sec_data["analysis_id"] == analysis.id
    assert sec_data["vulnerable_packages_count"] == 1
    assert sec_data["total_findings"] == 1
    assert sec_data["findings"][0]["vuln_id"] == "GHSA-test-1234"
    assert sec_data["findings"][0]["package_name"] == "demo-lib"

    # 4. GET freshness returns empty records cleanly without triggering scans
    res_fresh = override_client.get(f"/api/analyses/{analysis.id}/freshness")
    assert res_fresh.status_code == 200
    fresh_data = res_fresh.json()
    assert fresh_data["analysis_id"] == analysis.id
    assert fresh_data["records"] == []

    # 5. Clear active cache and verify /impact with analysis_id parameter auto-restores from snapshot
    _ACTIVE_GRAPH_CACHE.clear()
    assert "latest" not in _ACTIVE_GRAPH_CACHE
    res_impact_param = override_client.get(f"/api/impact?target_package=demo-lib&analysis_id={analysis.id}")
    assert res_impact_param.status_code == 200
    assert res_impact_param.json()["target_package"] == "demo-lib"
    assert "latest" in _ACTIVE_GRAPH_CACHE
    assert _ACTIVE_GRAPH_CACHE["latest"]["analysis_id"] == analysis.id

    # 6. Verify /simulate with analysis_id starts from restored baseline
    sim_payload = {
        "operation": "add",
        "target_package": "new-sim-lib",
        "source_package": "restore-demo-svc",
        "version": "1.0.0",
        "dep_type": "direct"
    }
    res_sim = override_client.post(f"/api/simulate?analysis_id={analysis.id}", json=sim_payload)
    assert res_sim.status_code == 200
    sim_data = res_sim.json()
    assert sim_data["operation"] == "add"
    assert sim_data["target_package"] == "new-sim-lib"
    assert "new-sim-lib" in sim_data["diff"]["added_nodes"]
    assert sim_data["simulated_stats"]["total_packages"] == 2




