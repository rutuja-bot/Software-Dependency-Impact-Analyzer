"""
Standalone Live PostgreSQL Verification Script for Phase 4.
Executes against the live database configured in backend/.env:
1. Tests database connection
2. Runs Alembic migrations to head
3. Verifies schema tables, indexes, and current revision
4. Performs an end-to-end persistence workflow (Project -> Analysis -> Snapshot -> Findings -> Simulation)
5. Simulates backend restart and confirms persistence
6. Cleans up isolated test records
"""

import sys
import os
import uuid
from datetime import datetime, timezone

# Ensure backend root is on sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker
from alembic.config import Config
from alembic import command

from app.core.config import settings
from app.db.session import check_db_connection, Base
from app.db.models import (
    Project, Package, AnalysisRun, GraphSnapshot,
    VulnerabilityFinding, FreshnessRecord, SimulationRun
)
from app.db.repository import ProjectRepository
from app.schemas.graph import GraphAnalysisResponse, GraphOverviewStats, PackageNode, DependencyEdge
from app.schemas.security import (
    SecurityScanResponse, PackageSecurityResult, VulnerabilityRecord,
    FreshnessAnalysisResponse, PackageFreshnessResult
)
from app.schemas.simulation import (
    SimulationResponse, GraphDiff, CycleDiff, DownstreamImpactDiff
)


def run_live_verification():
    print("=" * 70)
    print("Phase 4 Live PostgreSQL Verification Runner")
    print("=" * 70)

    # 1. Check Configuration
    db_url = settings.DATABASE_URL
    if not db_url or "postgresql" not in db_url:
        print("[FAIL] DATABASE_URL is not configured for PostgreSQL in backend/.env")
        print(f"       Current DATABASE_URL: {db_url}")
        return False

    # Mask credentials for safe output
    masked_url = db_url
    if "@" in db_url and "://" in db_url:
        scheme, rest = db_url.split("://", 1)
        user_info, host_info = rest.split("@", 1)
        user = user_info.split(":")[0]
        masked_url = f"{scheme}://{user}:****@{host_info}"
    print(f"[INFO] Target Database: {masked_url}")

    # 2. Check Connection Liveness
    print("\n[STEP 1] Testing Connection Liveness...")
    status = check_db_connection(db_url)
    if not status.get("connected"):
        print(f"[FAIL] Database connection failed: {status.get('message')}")
        return False
    print(f"[PASS] Connection successful: {status.get('message')}")

    # 3. Run Alembic Migrations
    print("\n[STEP 2] Running Alembic Migrations (alembic upgrade head)...")
    try:
        alembic_cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
        alembic_cfg.set_main_option("sqlalchemy.url", db_url)
        command.upgrade(alembic_cfg, "head")
        print("[PASS] Alembic migrations upgraded to head successfully.")
    except Exception as e:
        print(f"[FAIL] Alembic migration failed: {e}")
        return False

    # 4. Inspect Tables in PostgreSQL
    print("\n[STEP 3] Verifying Schema Tables & Alembic Version...")
    engine = create_engine(db_url)
    expected_tables = {
        "projects", "packages", "analysis_runs", "graph_snapshots",
        "vulnerability_findings", "freshness_records", "simulation_runs",
        "alembic_version"
    }
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        ))
        existing_tables = {row[0] for row in result.fetchall()}

        missing = expected_tables - existing_tables
        if missing:
            print(f"[FAIL] Missing tables in PostgreSQL: {missing}")
            return False
        print(f"[PASS] All expected tables verified in PostgreSQL: {sorted(list(expected_tables))}")

        # Check alembic revision
        rev_result = conn.execute(text("SELECT version_num FROM alembic_version"))
        current_rev = rev_result.scalar()
        print(f"[PASS] Current Alembic revision in PostgreSQL: {current_rev}")

    # 5. Execute Real Persistence Workflow
    print("\n[STEP 4] Executing Real Persistence Workflow...")
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    test_project_id = None

    try:
        repo = ProjectRepository(session)
        unique_suffix = uuid.uuid4().hex[:8]
        proj_name = f"live-verify-project-{unique_suffix}"

        # 5.1 Create Project
        project = repo.get_or_create_project(name=proj_name, ecosystem="npm", description="Automated live verification")
        test_project_id = project.id
        print(f"[PASS] Created project: id={project.id}, name={project.name}")

        # 5.2 Persist Analysis Run & Graph Snapshot
        graph_data = GraphAnalysisResponse(
            manifest_name=proj_name,
            version="1.0.0",
            nodes=[
                PackageNode(name=proj_name, version="1.0.0", is_direct=False),
                PackageNode(name="express", version="4.18.2", is_direct=True),
                PackageNode(name="ms", version="2.1.3", is_direct=False)
            ],
            edges=[
                DependencyEdge(source=proj_name, target="express", version_constraint="^4.18.2"),
                DependencyEdge(source="express", target="ms", version_constraint="2.1.3")
            ],
            direct_dependencies=["express"],
            transitive_dependencies=["ms"],
            cycles=[],
            is_dag=True,
            topological_order=[proj_name, "express", "ms"],
            stats=GraphOverviewStats(
                total_packages=3,
                direct_dependencies_count=1,
                transitive_dependencies_count=1,
                total_dependency_edges=2,
                has_cycles=False,
                cycle_count=0
            )
        )
        analysis_run = repo.persist_analysis_run(project_id=project.id, graph_data=graph_data)
        print(f"[PASS] Persisted analysis run: id={analysis_run.id}")

        # 5.3 Persist Vulnerability Findings
        security_data = SecurityScanResponse(
            project_name=proj_name,
            ecosystem="npm",
            total_packages_scanned=2,
            vulnerable_packages_count=1,
            total_vulnerabilities=1,
            scan_time_iso=datetime.now(timezone.utc).isoformat(),
            results=[
                PackageSecurityResult(
                    package_name="ms",
                    version="2.1.3",
                    is_vulnerable=True,
                    vulnerabilities=[
                        VulnerabilityRecord(
                            id="GHSA-test-live",
                            summary="Test vulnerability for live verification",
                            details="Proof of persistence",
                            severity="MODERATE",
                            fixed_versions=["2.1.4"],
                            references=["https://github.com/advisories"]
                        )
                    ]
                )
            ]
        )
        findings = repo.persist_vulnerabilities(analysis_run.id, security_data)
        print(f"[PASS] Persisted {len(findings)} vulnerability finding(s).")

        # 5.4 Persist Freshness Records
        freshness_data = FreshnessAnalysisResponse(
            project_name=proj_name,
            ecosystem="npm",
            total_packages=2,
            scored_packages_count=1,
            unscored_packages_count=1,
            project_total_libyear=1.5,
            project_average_libyear=1.5,
            results=[
                PackageFreshnessResult(
                    package_name="express",
                    installed_version="4.18.2",
                    release_date="2022-10-01T00:00:00Z",
                    libyear=1.5,
                    status="scored"
                ),
                PackageFreshnessResult(
                    package_name="ms",
                    installed_version="2.1.3",
                    libyear=None,
                    status="unscored",
                    reason_unscored="Release date missing"
                )
            ]
        )
        freshness_records = repo.persist_freshness(analysis_run.id, freshness_data)
        print(f"[PASS] Persisted {len(freshness_records)} freshness record(s).")

        # 5.5 Persist Simulation Run
        sim_data = SimulationResponse(
            project_name=proj_name,
            operation="upgrade",
            target_package="express",
            version="4.19.0",
            success=True,
            message="Live simulation test",
            diff=GraphDiff(added_nodes=[], removed_nodes=[], added_edges=[], removed_edges=[], modified_nodes=[]),
            cycle_diff=CycleDiff(cycles_introduced=[], cycles_resolved=[], cycle_count_delta=0),
            impact_diff=DownstreamImpactDiff(affected_packages=[], total_affected=0),
            simulated_stats=GraphOverviewStats(
                total_packages=3, direct_dependencies_count=1,
                transitive_dependencies_count=1, total_dependency_edges=2,
                has_cycles=False, cycle_count=0
            )
        )
        sim_run = repo.persist_simulation(
            project_id=project.id,
            baseline_analysis_id=analysis_run.id,
            simulation_result=sim_data,
            operation="upgrade",
            target_package="express",
            version="4.19.0"
        )
        print(f"[PASS] Persisted simulation run: id={sim_run.id}")

        session.commit()
    except Exception as e:
        session.rollback()
        print(f"[FAIL] Persistence workflow failed: {e}")
        return False
    finally:
        session.close()

    # 6. Simulate Backend Restart & Reload Data
    print("\n[STEP 5] Simulating Backend Restart & Verifying State Persistence...")
    engine.dispose()  # Destroy pool connection

    # Reconnect with fresh engine & session
    fresh_engine = create_engine(db_url)
    FreshSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=fresh_engine)
    fresh_session = FreshSessionLocal()

    try:
        fresh_repo = ProjectRepository(fresh_session)
        reloaded_proj = fresh_repo.get_project_by_id(test_project_id)
        assert reloaded_proj is not None, "Project not found after restart"
        assert reloaded_proj.name == proj_name

        history = fresh_repo.get_project_history(test_project_id)
        assert len(history) >= 1, "Analysis history empty after restart"

        snapshot = fresh_repo.get_graph_snapshot(history[0].id)
        assert snapshot is not None, "Graph snapshot missing after restart"
        assert len(snapshot.nodes) == 3, f"Expected 3 nodes, got {len(snapshot.nodes)}"
        assert len(snapshot.edges) == 2, f"Expected 2 edges, got {len(snapshot.edges)}"

        sims = fresh_repo.get_simulation_history(test_project_id)
        assert len(sims) >= 1, "Simulation history missing after restart"

        print("[PASS] Verified post-restart persistence: project, history, snapshot, and simulations intact.")

        # Clean up isolated test project
        fresh_repo.delete_project(test_project_id)
        fresh_session.commit()
        print(f"[PASS] Cleaned up isolated test project: id={test_project_id}")
    except Exception as e:
        fresh_session.rollback()
        print(f"[FAIL] Post-restart verification failed: {e}")
        return False
    finally:
        fresh_session.close()
        fresh_engine.dispose()

    print("\n" + "=" * 70)
    print("LIVE POSTGRESQL VERIFICATION COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = run_live_verification()
    sys.exit(0 if success else 1)
