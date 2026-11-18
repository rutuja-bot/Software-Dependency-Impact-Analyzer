import logging
from typing import Dict, List, Optional, Any, Tuple
import networkx as nx

from app.schemas.graph import PackageNode, GraphAnalysisResponse
from app.schemas.risk import FactorContribution, PackageRiskScore, ProjectRiskScore

logger = logging.getLogger(__name__)

class DependencyRiskService:
    """
    Explainable Dependency Risk Scoring Engine.
    
    Evaluates 4 distinct, orthogonal factors across a normalized 0–100 scale:
    1. Known Vulnerability Severity (Weight: 35% = 0.35) [OSV API / CVSS]
    2. Dependency Freshness / Lag (Weight: 25% = 0.25) [LibYear]
    3. Downstream Dependent Impact (Weight: 20% = 0.20) [Reverse Graph Reachability]
    4. Structural Dependency Criticality (Weight: 20% = 0.20) [Graph Centrality & Topology]
    
    Risk Categories:
    - 0–24: Low
    - 25–49: Moderate
    - 50–74: High
    - 75–100: Critical
    """

    FACTOR_WEIGHTS = {
        "vulnerability": 0.35,
        "freshness": 0.25,
        "downstream_impact": 0.20,
        "criticality": 0.20,
    }

    SEVERITY_SCORES = {
        "CRITICAL": 95.0,
        "HIGH": 75.0,
        "MODERATE": 50.0,
        "MEDIUM": 50.0,
        "LOW": 25.0,
        "CLEAN": 0.0,
    }

    @classmethod
    def get_risk_category(cls, score: float) -> str:
        if score >= 75.0:
            return "critical"
        elif score >= 50.0:
            return "high"
        elif score >= 25.0:
            return "moderate"
        else:
            return "low"

    def calculate_package_risk(
        self,
        package_name: str,
        graph: nx.DiGraph,
        root_package: str,
        vulnerabilities: Optional[List[Dict[str, Any]]] = None,
        libyear_record: Optional[Dict[str, Any]] = None,
        affected_downstream_count: Optional[int] = None
    ) -> PackageRiskScore:
        """
        Calculates an explainable 0-100 risk score for a single package.
        """
        total_nodes = max(1, graph.number_of_nodes())
        node_data = graph.nodes.get(package_name, {})
        version = node_data.get("version")
        is_root = node_data.get("is_root", package_name == root_package)
        dep_type = str(node_data.get("dep_type", "direct"))

        # -------------------------------------------------------------
        # Factor 1: Known Vulnerability Severity (35%)
        # -------------------------------------------------------------
        vuln_contrib = self._evaluate_vulnerability_factor(vulnerabilities)

        # -------------------------------------------------------------
        # Factor 2: Dependency Freshness (25%)
        # -------------------------------------------------------------
        fresh_contrib = self._evaluate_freshness_factor(libyear_record)

        # -------------------------------------------------------------
        # Factor 3: Downstream Impact (20%)
        # -------------------------------------------------------------
        if affected_downstream_count is None:
            # Calculate reachability in reverse graph
            R = graph.reverse(copy=False)
            if package_name in R:
                affected_set = nx.descendants(R, package_name)
                downstream_count = len(affected_set)
            else:
                downstream_count = 0
        else:
            downstream_count = affected_downstream_count

        impact_contrib = self._evaluate_impact_factor(downstream_count, total_nodes, is_root)

        # -------------------------------------------------------------
        # Factor 4: Dependency Criticality (20%)
        # -------------------------------------------------------------
        crit_contrib, raw_crit = self._evaluate_criticality_factor(
            package_name=package_name,
            graph=graph,
            root_package=root_package,
            is_root=is_root,
            total_nodes=total_nodes
        )

        # -------------------------------------------------------------
        # Composite Weighted Score Calculation
        # -------------------------------------------------------------
        factors = {
            "vulnerability": vuln_contrib,
            "freshness": fresh_contrib,
            "downstream_impact": impact_contrib,
            "criticality": crit_contrib,
        }

        # Calculate final normalized score
        total_score = sum(f.weighted_score for f in factors.values())
        final_score = round(max(0.0, min(100.0, total_score)), 1)
        category = self.get_risk_category(final_score)

        # Construct concise explanation summary
        summary = self._generate_package_summary(
            package_name=package_name,
            score=final_score,
            category=category,
            vuln_contrib=vuln_contrib,
            fresh_contrib=fresh_contrib,
            impact_contrib=impact_contrib,
            crit_contrib=crit_contrib
        )

        vuln_count = len(vulnerabilities) if vulnerabilities else 0
        max_sev = vuln_contrib.raw_value.get("max_severity") if isinstance(vuln_contrib.raw_value, dict) else None
        libyear_val = fresh_contrib.raw_value.get("libyear") if isinstance(fresh_contrib.raw_value, dict) else None

        return PackageRiskScore(
            package_name=package_name,
            version=version,
            dep_type=dep_type,
            is_root=is_root,
            risk_score=final_score,
            risk_category=category,
            factors=factors,
            summary_explanation=summary,
            vulnerabilities_count=vuln_count,
            max_vuln_severity=max_sev,
            libyear_lag=libyear_val,
            downstream_dependents_count=downstream_count,
            criticality_score=raw_crit
        )

    def _evaluate_vulnerability_factor(self, vulnerabilities: Optional[List[Dict[str, Any]]]) -> FactorContribution:
        weight = self.FACTOR_WEIGHTS["vulnerability"]
        if vulnerabilities is None:
            return FactorContribution(
                factor_name="vulnerability",
                display_name="Known Vulnerability Severity",
                raw_value={"count": 0, "status": "unscanned"},
                normalized_score=0.0,
                weight=weight,
                weighted_score=0.0,
                explanation="Package has not been checked against vulnerability databases yet.",
                status="unavailable"
            )

        if not vulnerabilities:
            return FactorContribution(
                factor_name="vulnerability",
                display_name="Known Vulnerability Severity",
                raw_value={"count": 0, "status": "clean"},
                normalized_score=0.0,
                weight=weight,
                weighted_score=0.0,
                explanation="No known CVE or OSV security advisories identified for this installed version.",
                status="clean"
            )

        # Find highest severity
        highest_score = 0.0
        max_sev = "LOW"
        for v in vulnerabilities:
            sev_str = str(v.get("severity") or "LOW").upper()
            score = self.SEVERITY_SCORES.get(sev_str, 35.0)
            if score > highest_score:
                highest_score = score
                max_sev = sev_str

        # Additional minor penalty for multiple distinct CVEs
        count_bonus = min(10.0, (len(vulnerabilities) - 1) * 3.0)
        norm_score = min(100.0, highest_score + count_bonus)
        weighted = round(norm_score * weight, 2)

        return FactorContribution(
            factor_name="vulnerability",
            display_name="Known Vulnerability Severity",
            raw_value={"count": len(vulnerabilities), "max_severity": max_sev},
            normalized_score=round(norm_score, 1),
            weight=weight,
            weighted_score=weighted,
            explanation=f"Found {len(vulnerabilities)} vulnerability advisory(ies) with peak severity '{max_sev}'.",
            status="scored"
        )

    def _evaluate_freshness_factor(self, libyear_record: Optional[Dict[str, Any]]) -> FactorContribution:
        weight = self.FACTOR_WEIGHTS["freshness"]
        if not libyear_record or libyear_record.get("status") in ("unresolved", "lookup_failed", "unscored"):
            reason = libyear_record.get("reason_unscored") if libyear_record else "No release timeline data"
            return FactorContribution(
                factor_name="freshness",
                display_name="Dependency Freshness (LibYear)",
                raw_value={"libyear": None, "reason": reason},
                normalized_score=0.0,
                weight=weight,
                weighted_score=0.0,
                explanation=f"Freshness data unavailable ({reason}).",
                status="unavailable"
            )

        libyear = float(libyear_record.get("libyear", 0.0) or 0.0)
        if libyear >= 5.0:
            norm_score = 100.0
            tier = "Severe staleness (5+ years behind latest release)"
        elif libyear >= 3.0:
            norm_score = 75.0
            tier = "Major staleness (3–5 years behind latest release)"
        elif libyear >= 1.0:
            norm_score = 50.0
            tier = "Moderate staleness (1–3 years behind latest release)"
        elif libyear >= 0.25:
            norm_score = 25.0
            tier = "Minor staleness (3–12 months behind)"
        else:
            norm_score = 0.0
            tier = "Up to date (< 3 months lag)"

        weighted = round(norm_score * weight, 2)
        return FactorContribution(
            factor_name="freshness",
            display_name="Dependency Freshness (LibYear)",
            raw_value={"libyear": round(libyear, 2)},
            normalized_score=norm_score,
            weight=weight,
            weighted_score=weighted,
            explanation=f"{tier} (installed version is {libyear:.2f} LibYears old).",
            status="scored"
        )

    def _evaluate_impact_factor(self, downstream_count: int, total_nodes: int, is_root: bool) -> FactorContribution:
        weight = self.FACTOR_WEIGHTS["downstream_impact"]
        if is_root:
            # Root package is the top consumer, not an upstream dependency for others
            return FactorContribution(
                factor_name="downstream_impact",
                display_name="Downstream Dependent Blast Radius",
                raw_value={"affected_dependents": 0, "total_nodes": total_nodes},
                normalized_score=0.0,
                weight=weight,
                weighted_score=0.0,
                explanation="Project root package (all other packages are dependencies, not downstream dependents).",
                status="clean"
            )

        if total_nodes <= 1:
            ratio = 0.0
        else:
            # Exclude self from denominator
            ratio = downstream_count / max(1, total_nodes - 1)

        norm_score = min(100.0, round(ratio * 100.0, 1))
        weighted = round(norm_score * weight, 2)

        return FactorContribution(
            factor_name="downstream_impact",
            display_name="Downstream Dependent Blast Radius",
            raw_value={"affected_dependents": downstream_count, "total_nodes": total_nodes},
            normalized_score=norm_score,
            weight=weight,
            weighted_score=weighted,
            explanation=f"A change or defect in this package propagates downstream to {downstream_count} dependent package(s) ({norm_score:.1f}% blast radius).",
            status="scored"
        )

    def _evaluate_criticality_factor(
        self,
        package_name: str,
        graph: nx.DiGraph,
        root_package: str,
        is_root: bool,
        total_nodes: int
    ) -> Tuple[FactorContribution, float]:
        weight = self.FACTOR_WEIGHTS["criticality"]

        if is_root:
            return (
                FactorContribution(
                    factor_name="criticality",
                    display_name="Structural Dependency Criticality",
                    raw_value={"role": "root"},
                    normalized_score=10.0,
                    weight=weight,
                    weighted_score=round(10.0 * weight, 2),
                    explanation="Project entry-point root manifest.",
                    status="scored"
                ),
                10.0
            )

        # 1. Direct root dependency bonus: +30
        is_direct_root_dep = graph.has_edge(root_package, package_name)
        root_points = 30.0 if is_direct_root_dep else 0.0

        # 2. In-degree ratio (how many packages directly require this package): up to 40
        in_degree = graph.in_degree(package_name) if package_name in graph else 0
        in_ratio = in_degree / max(1, total_nodes - 1)
        in_points = min(40.0, in_ratio * 100.0 * 0.4)

        # 3. Out-degree (how deep/foundational): up to 30
        out_degree = graph.out_degree(package_name) if package_name in graph else 0
        out_ratio = out_degree / max(1, total_nodes - 1)
        out_points = min(30.0, out_ratio * 100.0 * 0.3)

        raw_criticality = round(root_points + in_points + out_points, 1)
        norm_score = min(100.0, raw_criticality)
        weighted = round(norm_score * weight, 2)

        desc = []
        if is_direct_root_dep:
            desc.append("Direct top-level dependency")
        if in_degree > 1:
            desc.append(f"Required directly by {in_degree} distinct packages")
        if out_degree > 0:
            desc.append(f"Transitively relies on {out_degree} child dependencies")
        if not desc:
            desc.append("Leaf package with low topological coupling")

        return (
            FactorContribution(
                factor_name="criticality",
                display_name="Structural Dependency Criticality",
                raw_value={
                    "is_direct_root_dep": is_direct_root_dep,
                    "in_degree": in_degree,
                    "out_degree": out_degree
                },
                normalized_score=norm_score,
                weight=weight,
                weighted_score=weighted,
                explanation="; ".join(desc) + f" (topological score: {norm_score}/100).",
                status="scored"
            ),
            raw_criticality
        )

    def _generate_package_summary(
        self,
        package_name: str,
        score: float,
        category: str,
        vuln_contrib: FactorContribution,
        fresh_contrib: FactorContribution,
        impact_contrib: FactorContribution,
        crit_contrib: FactorContribution
    ) -> str:
        points = []
        if vuln_contrib.normalized_score >= 50.0:
            points.append(vuln_contrib.explanation)
        if fresh_contrib.normalized_score >= 50.0:
            points.append(fresh_contrib.explanation)
        if impact_contrib.normalized_score >= 50.0:
            points.append(f"High blast radius ({impact_contrib.normalized_score:.0f}% downstream affected)")
        if crit_contrib.normalized_score >= 50.0:
            points.append("High structural coupling")

        if not points:
            return f"Overall {category} risk profile ({score:.1f}/100) with stable metrics across all 4 factors."
        return f"{category.capitalize()} risk ({score:.1f}/100): " + "; ".join(points) + "."

    def evaluate_project_risk(
        self,
        graph: nx.DiGraph,
        root_package: str,
        project_name: Optional[str] = None,
        project_version: Optional[str] = "1.0.0",
        analysis_id: Optional[str] = None,
        security_findings: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        freshness_records: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> ProjectRiskScore:
        """
        Evaluates the entire project graph and computes package-level + project-level risk scores.
        """
        pkg_risks: List[PackageRiskScore] = []
        security_map = security_findings or {}
        freshness_map = freshness_records or {}

        # Precompute reverse reachability for all nodes efficiently
        R = graph.reverse(copy=False)
        reachability_counts: Dict[str, int] = {}
        for node in graph.nodes():
            if node in R:
                reachability_counts[node] = len(nx.descendants(R, node))
            else:
                reachability_counts[node] = 0

        for node in graph.nodes():
            vulns = security_map.get(node)
            fresh = freshness_map.get(node)
            aff_count = reachability_counts.get(node, 0)
            pkg_risk = self.calculate_package_risk(
                package_name=node,
                graph=graph,
                root_package=root_package,
                vulnerabilities=vulns,
                libyear_record=fresh,
                affected_downstream_count=aff_count
            )
            pkg_risks.append(pkg_risk)

        # Categorize
        crit_count = sum(1 for p in pkg_risks if p.risk_category == "critical")
        high_count = sum(1 for p in pkg_risks if p.risk_category == "high")
        mod_count = sum(1 for p in pkg_risks if p.risk_category == "moderate")
        low_count = sum(1 for p in pkg_risks if p.risk_category == "low")

        # Sort descending by risk score
        sorted_pkgs = sorted(pkg_risks, key=lambda p: p.risk_score, reverse=True)
        top_risky = sorted_pkgs[:10]

        # Calculate project composite score and project-level factor contributions
        # Exact documented linear combination:
        # R = 0.35 * Vulnerability + 0.25 * Freshness + 0.20 * Impact + 0.20 * Criticality
        vuln_w = self.FACTOR_WEIGHTS["vulnerability"]
        fresh_w = self.FACTOR_WEIGHTS["freshness"]
        impact_w = self.FACTOR_WEIGHTS["downstream_impact"]
        crit_w = self.FACTOR_WEIGHTS["criticality"]

        if not pkg_risks:
            overall_score = 0.0
            peak_pkg_score = 0.0
            peak_pkg_name = None
            project_factors = {
                "vulnerability": FactorContribution(
                    factor_name="vulnerability",
                    display_name="Known Vulnerability Severity",
                    raw_value={"count": 0},
                    normalized_score=0.0,
                    weight=vuln_w,
                    weighted_score=0.0,
                    explanation="No dependencies present in project graph.",
                    status="clean"
                ),
                "freshness": FactorContribution(
                    factor_name="freshness",
                    display_name="Dependency Freshness (LibYear)",
                    raw_value={"libyear": 0.0},
                    normalized_score=0.0,
                    weight=fresh_w,
                    weighted_score=0.0,
                    explanation="No dependencies present in project graph.",
                    status="clean"
                ),
                "downstream_impact": FactorContribution(
                    factor_name="downstream_impact",
                    display_name="Downstream Dependent Blast Radius",
                    raw_value={"affected_dependents": 0},
                    normalized_score=0.0,
                    weight=impact_w,
                    weighted_score=0.0,
                    explanation="No dependencies present in project graph.",
                    status="clean"
                ),
                "criticality": FactorContribution(
                    factor_name="criticality",
                    display_name="Structural Dependency Criticality",
                    raw_value={"role": "empty"},
                    normalized_score=0.0,
                    weight=crit_w,
                    weighted_score=0.0,
                    explanation="No dependencies present in project graph.",
                    status="clean"
                ),
            }
        else:
            peak_pkg_score = sorted_pkgs[0].risk_score
            peak_pkg_name = sorted_pkgs[0].package_name

            # Calculate project-wide mean normalized score for each of the 4 factors
            n_pkgs = len(pkg_risks)
            vuln_norm = round(sum(p.factors["vulnerability"].normalized_score for p in pkg_risks) / n_pkgs, 1)
            fresh_norm = round(sum(p.factors["freshness"].normalized_score for p in pkg_risks) / n_pkgs, 1)
            impact_norm = round(sum(p.factors["downstream_impact"].normalized_score for p in pkg_risks) / n_pkgs, 1)
            crit_norm = round(sum(p.factors["criticality"].normalized_score for p in pkg_risks) / n_pkgs, 1)

            vuln_weighted = round(vuln_norm * vuln_w, 2)
            fresh_weighted = round(fresh_norm * fresh_w, 2)
            impact_weighted = round(impact_norm * impact_w, 2)
            crit_weighted = round(crit_norm * crit_w, 2)

            project_factors = {
                "vulnerability": FactorContribution(
                    factor_name="vulnerability",
                    display_name="Known Vulnerability Severity",
                    raw_value={"average_normalized": vuln_norm},
                    normalized_score=vuln_norm,
                    weight=vuln_w,
                    weighted_score=vuln_weighted,
                    explanation=f"Project-wide average vulnerability severity: {vuln_norm}/100.",
                    status="scored" if vuln_norm > 0 else "clean"
                ),
                "freshness": FactorContribution(
                    factor_name="freshness",
                    display_name="Dependency Freshness (LibYear)",
                    raw_value={"average_normalized": fresh_norm},
                    normalized_score=fresh_norm,
                    weight=fresh_w,
                    weighted_score=fresh_weighted,
                    explanation=f"Project-wide average release age lag: {fresh_norm}/100.",
                    status="scored" if fresh_norm > 0 else "clean"
                ),
                "downstream_impact": FactorContribution(
                    factor_name="downstream_impact",
                    display_name="Downstream Dependent Blast Radius",
                    raw_value={"average_normalized": impact_norm},
                    normalized_score=impact_norm,
                    weight=impact_w,
                    weighted_score=impact_weighted,
                    explanation=f"Project-wide average downstream blast radius: {impact_norm}/100.",
                    status="scored"
                ),
                "criticality": FactorContribution(
                    factor_name="criticality",
                    display_name="Structural Dependency Criticality",
                    raw_value={"average_normalized": crit_norm},
                    normalized_score=crit_norm,
                    weight=crit_w,
                    weighted_score=crit_weighted,
                    explanation=f"Project-wide average structural coupling: {crit_norm}/100.",
                    status="scored"
                ),
            }

            total_weighted = vuln_weighted + fresh_weighted + impact_weighted + crit_weighted
            overall_score = round(max(0.0, min(100.0, total_weighted)), 1)

        overall_score = max(0.0, min(100.0, overall_score))
        overall_category = self.get_risk_category(overall_score)

        notes = (
            "Composite 0-100 project risk score combines 4 factors: Known Vulnerability Severity (35%), "
            "Dependency Freshness / LibYear (25%), Downstream Impact Radius (20%), and Structural Criticality (20%). "
            "Each package risk score and the project-wide composite score evaluate this linear combination with exact consistency."
        )

        return ProjectRiskScore(
            project_name=project_name or root_package,
            project_version=project_version,
            analysis_id=analysis_id,
            overall_score=overall_score,
            overall_category=overall_category,
            total_packages_evaluated=len(pkg_risks),
            critical_risk_packages_count=crit_count,
            high_risk_packages_count=high_count,
            moderate_risk_packages_count=mod_count,
            low_risk_packages_count=low_count,
            top_risky_packages=top_risky,
            all_package_risks=sorted_pkgs,
            factor_weights=self.FACTOR_WEIGHTS,
            factors=project_factors,
            peak_package_score=peak_pkg_score,
            peak_package_name=peak_pkg_name,
            methodology_notes=notes
        )
