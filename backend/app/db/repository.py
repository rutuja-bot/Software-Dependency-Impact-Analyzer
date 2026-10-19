import logging
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.db.models import (
    Project,
    Package,
    AnalysisRun,
    GraphSnapshot,
    VulnerabilityFinding,
    FreshnessRecord,
    SimulationRun
)
from app.schemas.graph import GraphAnalysisResponse
from app.schemas.security import SecurityScanResponse, FreshnessAnalysisResponse
from app.schemas.simulation import SimulationResponse

logger = logging.getLogger(__name__)

class ProjectRepository:
    """
    Dedicated persistence layer handling ACID transactions for Projects, Analysis Runs,
    Graph Snapshots, Security/Freshness findings, and What-If Simulations.
    """

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # 1. Projects
    # =========================================================================

    def get_or_create_project(self, name: str, ecosystem: str = "npm", description: Optional[str] = None) -> Project:
        """
        Retrieves an existing project by (name, ecosystem) or creates a new one.
        Guarantees idempotency.
        """
        project = (
            self.db.query(Project)
            .filter(Project.name == name, Project.ecosystem == ecosystem)
            .first()
        )
        if not project:
            project = Project(
                name=name,
                ecosystem=ecosystem,
                description=description
            )
            self.db.add(project)
            self.db.commit()
            self.db.refresh(project)
        return project

    def list_projects(self, limit: int = 50, offset: int = 0) -> List[Project]:
        return (
            self.db.query(Project)
            .order_by(desc(Project.updated_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_project_by_id(self, project_id: str) -> Optional[Project]:
        return self.db.query(Project).filter(Project.id == project_id).first()

    def get_project_by_name(self, name: str, ecosystem: str = "npm") -> Optional[Project]:
        return (
            self.db.query(Project)
            .filter(Project.name == name, Project.ecosystem == ecosystem)
            .first()
        )

    def count_projects(self) -> int:
        return self.db.query(func.count(Project.id)).scalar() or 0

    # =========================================================================
    # 2. Analysis Runs & Graph Snapshots
    # =========================================================================

    def record_analysis_run(
        self,
        project: Project,
        analysis_data: GraphAnalysisResponse,
        manifest_metadata: Optional[Dict[str, Any]] = None,
        status: str = "completed",
        error_summary: Optional[str] = None
    ) -> AnalysisRun:
        """
        Atomically records a new analysis run and its immutable graph snapshot.
        Enforces transaction rollback on failure.
        """
        stats = analysis_data.stats
        nodes_dict = [n.model_dump() if hasattr(n, "model_dump") else n.dict() for n in analysis_data.nodes]
        edges_dict = [e.model_dump() if hasattr(e, "model_dump") else e.dict() for e in analysis_data.edges]
        cycles_dict = [c.model_dump() if hasattr(c, "model_dump") else c.dict() for c in analysis_data.cycles]

        analysis = AnalysisRun(
            project_id=project.id,
            project_version=analysis_data.project_version,
            status=status,
            total_packages=stats.total_packages,
            direct_dependencies_count=stats.direct_dependencies_count,
            transitive_dependencies_count=stats.transitive_dependencies_count,
            total_dependency_edges=stats.total_dependency_edges,
            has_cycles=stats.has_cycles,
            cycle_count=stats.cycle_count,
            is_dag=stats.is_dag,
            topological_order=analysis_data.topological_order,
            cycle_details=cycles_dict,
            manifest_metadata=manifest_metadata,
            error_summary=error_summary
        )
        self.db.add(analysis)
        self.db.flush()  # Populates analysis.id

        # Persist reproducible graph snapshot
        snapshot = GraphSnapshot(
            analysis_id=analysis.id,
            nodes=nodes_dict,
            edges=edges_dict
        )
        self.db.add(snapshot)

        # Record unique packages in the ecosystem if not present (batched)
        candidate_names = {
            node.name if hasattr(node, "name") else node.get("name")
            for node in analysis_data.nodes
        }
        candidate_names.discard(None)
        candidate_names.discard(project.name)

        if candidate_names:
            existing_records = (
                self.db.query(Package.name)
                .filter(Package.name.in_(candidate_names), Package.ecosystem == project.ecosystem)
                .all()
            )
            existing_names = {r[0] for r in existing_records}
            for pkg_name in candidate_names - existing_names:
                self.db.add(Package(name=pkg_name, ecosystem=project.ecosystem))

        self.db.commit()
        self.db.refresh(analysis)
        return analysis

    def list_analyses_for_project(self, project_id: str, limit: int = 50, offset: int = 0) -> List[AnalysisRun]:
        return (
            self.db.query(AnalysisRun)
            .filter(AnalysisRun.project_id == project_id)
            .order_by(desc(AnalysisRun.created_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_analysis_by_id(self, analysis_id: str) -> Optional[AnalysisRun]:
        return self.db.query(AnalysisRun).filter(AnalysisRun.id == analysis_id).first()

    def get_latest_analysis_for_project(self, project_id: str) -> Optional[AnalysisRun]:
        return (
            self.db.query(AnalysisRun)
            .filter(AnalysisRun.project_id == project_id)
            .order_by(desc(AnalysisRun.created_at))
            .first()
        )

    def count_analyses(self) -> int:
        return self.db.query(func.count(AnalysisRun.id)).scalar() or 0

    # =========================================================================
    # 3. Security Findings Persistence
    # =========================================================================

    def record_security_scan(self, analysis_id: str, scan_res: SecurityScanResponse) -> List[VulnerabilityFinding]:
        """
        Persists individual OSV vulnerability findings for an analysis run idempotently.
        Prevents duplicate findings when the scan is repeated for the same analysis_id.
        Safely removes obsolete STATUS-ERROR placeholders when a subsequent retry succeeds for a package.
        Preserves STATUS-UNRESOLVED placeholders and distinct multi-advisories.
        Identifies findings using the stable composite key: (package_name, vuln_id).
        Ensures transaction safety with rollback on failure.
        """
        existing_findings = (
            self.db.query(VulnerabilityFinding)
            .filter(VulnerabilityFinding.analysis_id == analysis_id)
            .all()
        )
        existing_by_key: Dict[Tuple[str, str], VulnerabilityFinding] = {}
        existing_errors_by_pkg: Dict[str, List[VulnerabilityFinding]] = {}

        for f in existing_findings:
            key = (f.package_name, f.vuln_id)
            if key not in existing_by_key:
                existing_by_key[key] = f
            if f.vuln_id == "STATUS-ERROR" and f.scan_status == "error":
                existing_errors_by_pkg.setdefault(f.package_name, []).append(f)

        findings = []
        seen_in_batch = set()

        for pkg_res in scan_res.results:
            pkg_name = pkg_res.package_name
            pkg_ver = pkg_res.version

            # If the scan succeeded (vulnerable, clean, or resolved), remove obsolete error placeholders for this package
            if pkg_res.status in ("vulnerable", "clean", "unresolved") and pkg_name in existing_errors_by_pkg:
                for err_f in existing_errors_by_pkg[pkg_name]:
                    self.db.delete(err_f)
                    existing_by_key.pop((pkg_name, "STATUS-ERROR"), None)
                del existing_errors_by_pkg[pkg_name]

            if pkg_res.status == "vulnerable":
                for vuln in pkg_res.vulnerabilities:
                    key = (pkg_name, vuln.id)
                    if key in seen_in_batch:
                        continue
                    seen_in_batch.add(key)

                    refs = [r.model_dump() if hasattr(r, "model_dump") else (r.dict() if hasattr(r, "dict") else r) for r in vuln.references]
                    if key in existing_by_key:
                        existing = existing_by_key[key]
                        # Safe non-destructive update if new fields are populated
                        if pkg_ver and not existing.package_version:
                            existing.package_version = pkg_ver
                        if vuln.summary and not existing.summary:
                            existing.summary = vuln.summary
                        if vuln.details and not existing.details:
                            existing.details = vuln.details
                        if vuln.severity and not existing.severity:
                            existing.severity = vuln.severity
                        if vuln.fixed_versions and not existing.fixed_versions:
                            existing.fixed_versions = vuln.fixed_versions
                        if refs and not existing.references:
                            existing.references = refs
                        findings.append(existing)
                    else:
                        f = VulnerabilityFinding(
                            analysis_id=analysis_id,
                            package_name=pkg_name,
                            package_version=pkg_ver,
                            vuln_id=vuln.id,
                            summary=vuln.summary,
                            details=vuln.details,
                            severity=vuln.severity,
                            fixed_versions=vuln.fixed_versions,
                            references=refs,
                            scan_status="vulnerable"
                        )
                        self.db.add(f)
                        existing_by_key[key] = f
                        findings.append(f)

            elif pkg_res.status in ("error", "unresolved"):
                vuln_id = "STATUS-" + pkg_res.status.upper()
                key = (pkg_name, vuln_id)
                if key in seen_in_batch:
                    continue
                seen_in_batch.add(key)

                if key in existing_by_key:
                    existing = existing_by_key[key]
                    if pkg_ver:
                        existing.package_version = pkg_ver
                    if pkg_res.error_message:
                        existing.summary = pkg_res.error_message
                    findings.append(existing)
                else:
                    f = VulnerabilityFinding(
                        analysis_id=analysis_id,
                        package_name=pkg_name,
                        package_version=pkg_ver,
                        vuln_id=vuln_id,
                        summary=pkg_res.error_message,
                        scan_status=pkg_res.status
                    )
                    self.db.add(f)
                    existing_by_key[key] = f
                    findings.append(f)

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return findings

    def get_security_findings_for_analysis(self, analysis_id: str) -> List[VulnerabilityFinding]:
        return (
            self.db.query(VulnerabilityFinding)
            .filter(VulnerabilityFinding.analysis_id == analysis_id)
            .all()
        )

    # =========================================================================
    # 4. Freshness Records Persistence
    # =========================================================================

    def record_freshness_analysis(self, analysis_id: str, fresh_res: FreshnessAnalysisResponse) -> List[FreshnessRecord]:
        """
        Persists package-level LibYear metrics and overall aggregations idempotently.
        Safely updates existing records for the same analysis_id and package_name on repeated scans or retries.
        Ensures transaction safety with rollback on failure.
        """
        existing_records = (
            self.db.query(FreshnessRecord)
            .filter(FreshnessRecord.analysis_id == analysis_id)
            .all()
        )
        existing_by_pkg: Dict[str, FreshnessRecord] = {r.package_name: r for r in existing_records}

        records = []
        tot = fresh_res.project_total_libyear
        avg = fresh_res.project_average_libyear

        for pkg in fresh_res.results:
            rel_dt = None
            if pkg.release_date:
                try:
                    from datetime import datetime
                    clean_str = pkg.release_date.replace("Z", "+00:00")
                    rel_dt = datetime.fromisoformat(clean_str)
                except Exception:
                    pass

            pkg_name = pkg.package_name
            if pkg_name in existing_by_pkg:
                rec = existing_by_pkg[pkg_name]
                rec.installed_version = pkg.version
                rec.release_date = rel_dt
                rec.libyear = pkg.libyear
                rec.status = pkg.status
                rec.reason_unscored = pkg.reason_unscored
                rec.project_total_libyear = tot
                rec.project_average_libyear = avg
                records.append(rec)
            else:
                rec = FreshnessRecord(
                    analysis_id=analysis_id,
                    package_name=pkg_name,
                    installed_version=pkg.version,
                    release_date=rel_dt,
                    libyear=pkg.libyear,
                    status=pkg.status,
                    reason_unscored=pkg.reason_unscored,
                    project_total_libyear=tot,
                    project_average_libyear=avg
                )
                self.db.add(rec)
                existing_by_pkg[pkg_name] = rec
                records.append(rec)

        # Update project total and avg across all existing records for consistency
        for rec in existing_records:
            rec.project_total_libyear = tot
            rec.project_average_libyear = avg

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return records

    def get_freshness_records_for_analysis(self, analysis_id: str) -> List[FreshnessRecord]:
        return (
            self.db.query(FreshnessRecord)
            .filter(FreshnessRecord.analysis_id == analysis_id)
            .all()
        )

    # =========================================================================
    # 5. Simulation Runs Persistence
    # =========================================================================

    def record_simulation_run(
        self,
        project_id: str,
        baseline_analysis_id: str,
        sim_res: SimulationResponse
    ) -> SimulationRun:
        """
        Persists What-If change simulation results separately from baseline snapshots.
        """
        diff_dict = sim_res.diff.model_dump() if hasattr(sim_res.diff, "model_dump") else sim_res.diff.dict()
        cycle_diff_dict = sim_res.cycle_diff.model_dump() if hasattr(sim_res.cycle_diff, "model_dump") else sim_res.cycle_diff.dict()
        impact_diff_dict = sim_res.impact_diff.model_dump() if hasattr(sim_res.impact_diff, "model_dump") else sim_res.impact_diff.dict()
        sim_stats_dict = sim_res.simulated_stats.model_dump() if hasattr(sim_res.simulated_stats, "model_dump") else sim_res.simulated_stats.dict()

        sim = SimulationRun(
            project_id=project_id,
            baseline_analysis_id=baseline_analysis_id,
            operation=sim_res.operation,
            target_package=sim_res.target_package,
            source_package=sim_res.source_package,
            message=sim_res.message,
            diff=diff_dict,
            cycle_diff=cycle_diff_dict,
            impact_diff=impact_diff_dict,
            simulated_stats=sim_stats_dict,
            warnings=sim_res.warnings,
            status="completed"
        )
        self.db.add(sim)
        self.db.commit()
        self.db.refresh(sim)
        return sim

    def list_simulations_for_project(self, project_id: str, limit: int = 50, offset: int = 0) -> List[SimulationRun]:
        return (
            self.db.query(SimulationRun)
            .filter(SimulationRun.project_id == project_id)
            .order_by(desc(SimulationRun.created_at))
            .offset(offset)
            .limit(limit)
            .all()
        )

    def list_simulations_for_analysis(self, analysis_id: str) -> List[SimulationRun]:
        return (
            self.db.query(SimulationRun)
            .filter(SimulationRun.baseline_analysis_id == analysis_id)
            .order_by(desc(SimulationRun.created_at))
            .all()
        )

    def get_simulation_by_id(self, simulation_id: str) -> Optional[SimulationRun]:
        return self.db.query(SimulationRun).filter(SimulationRun.id == simulation_id).first()

    def count_simulations(self) -> int:
        return self.db.query(func.count(SimulationRun.id)).scalar() or 0
