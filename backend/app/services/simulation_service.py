import copy
from typing import Dict, List, Optional, Set, Tuple, Any
import networkx as nx

from app.schemas.graph import (
    DependencyType,
    PackageNode,
    DependencyEdge,
    GraphOverviewStats,
    CycleDetail,
    GraphAnalysisResponse
)
from app.schemas.simulation import (
    SimulationOperationType,
    SimulationRequest,
    GraphDiff,
    CycleDiff,
    DownstreamImpactDiff,
    SimulationResponse
)
from app.schemas.comparison import (
    ComparisonNodeDiff,
    ComparisonEdgeDiff,
    VulnerabilityDelta,
    RiskScoreDelta,
    GraphComparisonResponse
)
from app.services.graph_service import DependencyGraphService
from app.services.risk_service import DependencyRiskService

class DependencySimulationService:
    """
    In-memory What-If Simulation Engine.
    
    Guarantees non-destructive execution:
    Every operation clones the baseline DiGraph (copy.deepcopy) and computes
    structural graph differences (added/removed nodes, added/removed edges,
    cycle deltas, and downstream reachability shifts) without mutating the original graph.
    """

    def __init__(self, graph_service: Optional[DependencyGraphService] = None):
        self.graph_service = graph_service or DependencyGraphService()

    def simulate(
        self,
        baseline_graph: nx.DiGraph,
        root_package: str,
        request: SimulationRequest,
        project_version: Optional[str] = "1.0.0"
    ) -> SimulationResponse:
        """
        Executes a simulated change on an isolated copy of the baseline graph.
        """
        # Baseline must be strictly isolated: operate on a deep copy
        simulated_graph = copy.deepcopy(baseline_graph)

        source_pkg = request.source_package or root_package
        target_pkg = request.target_package.strip()
        warnings: List[str] = []

        # Validate target package name
        if not target_pkg:
            raise ValueError("Target package name cannot be empty.")

        # Compute baseline analysis & impact before applying simulated mutation
        baseline_analysis = self.graph_service.analyze_graph(baseline_graph, root_package, project_version)
        baseline_impact = self.graph_service.find_affected_downstream_packages(baseline_graph, target_pkg)

        # Track diff sets
        added_nodes: List[str] = []
        removed_nodes: List[str] = []
        added_edges: List[DependencyEdge] = []
        removed_edges: List[DependencyEdge] = []
        version_changes: Dict[str, Dict[str, Optional[str]]] = {}
        orphaned_nodes: List[str] = []
        message = ""

        # --- OPERATION 1: ADD DEPENDENCY ---
        if request.operation == SimulationOperationType.ADD:
            if source_pkg not in simulated_graph:
                raise ValueError(f"Source package '{source_pkg}' does not exist in the graph.")

            # Check if edge already exists
            if simulated_graph.has_edge(source_pkg, target_pkg):
                existing_ver = simulated_graph.edges[source_pkg, target_pkg].get("version_constraint")
                warnings.append(
                    f"Dependency relationship '{source_pkg} -> {target_pkg}' already exists"
                    + (f" with requirement '{existing_ver}'." if existing_ver else ".")
                )
                message = f"Dependency '{source_pkg} -> {target_pkg}' is already present in graph."
            else:
                # Add node if target not in graph
                is_new_node = target_pkg not in simulated_graph
                if is_new_node:
                    simulated_graph.add_node(
                        target_pkg,
                        version=request.version or "simulated",
                        is_root=False,
                        dep_type=request.dep_type or DependencyType.DIRECT,
                        depth=None
                    )
                    added_nodes.append(target_pkg)
                
                # Add directed edge source -> target
                simulated_graph.add_edge(
                    source_pkg,
                    target_pkg,
                    version_constraint=request.version,
                    relation="depends_on"
                )
                added_edges.append(DependencyEdge(
                    source=source_pkg,
                    target=target_pkg,
                    version_constraint=request.version,
                    relation="depends_on"
                ))
                message = f"Simulated adding dependency '{source_pkg} -> {target_pkg}'."

        # --- OPERATION 2: REMOVE DEPENDENCY ---
        elif request.operation == SimulationOperationType.REMOVE:
            if target_pkg not in simulated_graph:
                raise ValueError(f"Target package '{target_pkg}' does not exist in the graph.")

            if target_pkg == root_package:
                raise ValueError("Cannot remove the project root package.")

            # Check if an edge from source_pkg to target_pkg exists
            if simulated_graph.has_edge(source_pkg, target_pkg):
                orig_constraint = simulated_graph.edges[source_pkg, target_pkg].get("version_constraint")
                simulated_graph.remove_edge(source_pkg, target_pkg)
                removed_edges.append(DependencyEdge(
                    source=source_pkg,
                    target=target_pkg,
                    version_constraint=orig_constraint,
                    relation="depends_on"
                ))
                message = f"Simulated removing dependency edge '{source_pkg} -> {target_pkg}'."
            else:
                # If no explicit edge from source_pkg, check if user requested package removal
                # Remove all incoming edges to target_pkg
                in_edges = list(simulated_graph.in_edges(target_pkg, data=True))
                if not in_edges:
                    warnings.append(f"Package '{target_pkg}' had no incoming dependencies.")
                for u, v, data in in_edges:
                    simulated_graph.remove_edge(u, v)
                    removed_edges.append(DependencyEdge(
                        source=u,
                        target=v,
                        version_constraint=data.get("version_constraint"),
                        relation="depends_on"
                    ))
                message = f"Simulated removing all incoming dependency links to '{target_pkg}'."

            # If target has in-degree 0 in simulated graph, it is removed as a node from simulated graph
            if simulated_graph.in_degree(target_pkg) == 0 and target_pkg != root_package:
                simulated_graph.remove_node(target_pkg)
                removed_nodes.append(target_pkg)

            # Calculate newly unreachable (orphaned) packages from root resulting from this removal
            baseline_reachable = set(nx.descendants(baseline_graph, root_package))
            simulated_reachable = set(nx.descendants(simulated_graph, root_package))
            orphaned = (baseline_reachable - simulated_reachable) - {target_pkg} - set(removed_nodes)
            orphaned_nodes = sorted(list(orphaned))

        # --- OPERATION 3: UPGRADE DEPENDENCY ---
        elif request.operation == SimulationOperationType.UPGRADE:
            if target_pkg not in simulated_graph:
                raise ValueError(f"Package '{target_pkg}' cannot be upgraded because it is not present in the graph.")

            if not request.version or not request.version.strip():
                raise ValueError("Proposed version must be specified for upgrade operation.")

            original_version = simulated_graph.nodes[target_pkg].get("version")
            proposed_version = request.version.strip()

            # Mutate node metadata in simulated copy
            simulated_graph.nodes[target_pkg]["version"] = proposed_version
            version_changes[target_pkg] = {
                "original_version": original_version,
                "simulated_version": proposed_version
            }

            # Update version_constraint on incoming edges if from root/source
            for u, v in simulated_graph.in_edges(target_pkg):
                simulated_graph.edges[u, v]["version_constraint"] = proposed_version

            message = f"Simulated upgrading '{target_pkg}' from '{original_version}' to '{proposed_version}'."
            warnings.append(
                f"Structural simulation only: version compatibility and transitive requirements of '{target_pkg}@{proposed_version}' are unverified."
            )

        # Re-compute BFS depths on simulated graph
        self.graph_service._calculate_depths(simulated_graph, root_package)

        # Compute full simulated analysis
        simulated_analysis = self.graph_service.analyze_graph(simulated_graph, root_package, project_version)

        # Cycle comparison
        baseline_cycle_paths = {tuple(c.cycle_path) for c in baseline_analysis.cycles}
        simulated_cycle_paths = {tuple(c.cycle_path) for c in simulated_analysis.cycles}

        new_cycles_tuples = simulated_cycle_paths - baseline_cycle_paths
        eliminated_cycles_tuples = baseline_cycle_paths - simulated_cycle_paths

        introduced_cycles = [
            CycleDetail(cycle_path=list(cp), cycle_length=len(cp) - 1)
            for cp in new_cycles_tuples
        ]
        eliminated_cycles = [
            CycleDetail(cycle_path=list(cp), cycle_length=len(cp) - 1)
            for cp in eliminated_cycles_tuples
        ]

        if introduced_cycles:
            warnings.append(f"Simulation introduced {len(introduced_cycles)} new circular dependency loop(s)!")

        cycle_diff = CycleDiff(
            introduced_cycles=introduced_cycles,
            eliminated_cycles=eliminated_cycles,
            baseline_cycle_count=len(baseline_analysis.cycles),
            simulated_cycle_count=len(simulated_analysis.cycles)
        )

        # Downstream impact comparison
        simulated_impact = self.graph_service.find_affected_downstream_packages(simulated_graph, target_pkg)
        baseline_affected_set = set(baseline_impact.affected_packages)
        simulated_affected_set = set(simulated_impact.affected_packages)

        newly_affected = sorted(list(simulated_affected_set - baseline_affected_set))
        no_longer_affected = sorted(list(baseline_affected_set - simulated_affected_set))

        impact_diff = DownstreamImpactDiff(
            target_package=target_pkg,
            baseline_affected_count=baseline_impact.affected_count,
            simulated_affected_count=simulated_impact.affected_count,
            newly_affected_packages=newly_affected,
            no_longer_affected_packages=no_longer_affected
        )

        # Graph diff
        graph_diff = GraphDiff(
            added_nodes=added_nodes,
            removed_nodes=removed_nodes,
            added_edges=added_edges,
            removed_edges=removed_edges,
            orphaned_nodes=orphaned_nodes,
            version_changes=version_changes
        )

        return SimulationResponse(
            operation=request.operation,
            target_package=target_pkg,
            source_package=source_pkg,
            message=message,
            baseline_stats=baseline_analysis.stats,
            simulated_stats=simulated_analysis.stats,
            diff=graph_diff,
            cycle_diff=cycle_diff,
            impact_diff=impact_diff,
            simulated_analysis=simulated_analysis,
            warnings=warnings
        )

    def compare_simulation(
        self,
        baseline_graph: nx.DiGraph,
        root_package: str,
        request: SimulationRequest,
        project_version: Optional[str] = "1.0.0",
        security_findings: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        freshness_records: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> GraphComparisonResponse:
        """
        Computes a comprehensive Before-and-After graph comparison, including
        structural diff, newly affected downstream packages, introduced/resolved
        vulnerabilities, and before/after risk scores.
        """
        # 1. Run simulation
        sim_res = self.simulate(baseline_graph, root_package, request, project_version)

        # 2. Baseline & Simulated Risk Scores
        risk_service = DependencyRiskService()
        baseline_risk = risk_service.evaluate_project_risk(
            graph=baseline_graph,
            root_package=root_package,
            project_version=project_version,
            security_findings=security_findings,
            freshness_records=freshness_records
        )

        # Build simulated graph copy for risk evaluation
        simulated_graph = copy.deepcopy(baseline_graph)
        # Apply changes to simulated_graph
        if request.operation == SimulationOperationType.ADD:
            src = request.source_package or root_package
            tgt = request.target_package.strip()
            if tgt not in simulated_graph:
                simulated_graph.add_node(tgt, version=request.version or "simulated", is_root=False, dep_type=request.dep_type or DependencyType.DIRECT)
            simulated_graph.add_edge(src, tgt, version_constraint=request.version, relation="depends_on")
        elif request.operation == SimulationOperationType.REMOVE:
            tgt = request.target_package.strip()
            src = request.source_package or root_package
            if simulated_graph.has_edge(src, tgt):
                simulated_graph.remove_edge(src, tgt)
            else:
                for u, v in list(simulated_graph.in_edges(tgt)):
                    simulated_graph.remove_edge(u, v)
            if simulated_graph.in_degree(tgt) == 0 and tgt != root_package:
                simulated_graph.remove_node(tgt)
        elif request.operation == SimulationOperationType.UPGRADE:
            tgt = request.target_package.strip()
            if tgt in simulated_graph:
                simulated_graph.nodes[tgt]["version"] = request.version.strip()
                for u, v in simulated_graph.in_edges(tgt):
                    simulated_graph.edges[u, v]["version_constraint"] = request.version.strip()

        # Vulnerability resolution / introduction tracking
        sec_map = dict(security_findings or {})
        simulated_sec_map = dict(sec_map)
        introduced_vulns: List[Dict[str, Any]] = []
        resolved_vulns: List[Dict[str, Any]] = []

        if request.operation == SimulationOperationType.REMOVE:
            tgt = request.target_package.strip()
            if tgt in sec_map and sec_map[tgt]:
                resolved_vulns.extend(sec_map[tgt])
                simulated_sec_map.pop(tgt, None)
        elif request.operation == SimulationOperationType.UPGRADE:
            tgt = request.target_package.strip()
            # If upgraded, assume vulnerabilities from the old version are addressed by the upgrade
            if tgt in sec_map and sec_map[tgt]:
                resolved_vulns.extend(sec_map[tgt])
                simulated_sec_map[tgt] = []

        simulated_risk = risk_service.evaluate_project_risk(
            graph=simulated_graph,
            root_package=root_package,
            project_version=project_version,
            security_findings=simulated_sec_map,
            freshness_records=freshness_records
        )

        score_change = round(simulated_risk.overall_score - baseline_risk.overall_score, 1)
        risk_delta = RiskScoreDelta(
            baseline_score=baseline_risk.overall_score,
            simulated_score=simulated_risk.overall_score,
            score_change=score_change,
            baseline_category=baseline_risk.overall_category,
            simulated_category=simulated_risk.overall_category,
            category_changed=baseline_risk.overall_category != simulated_risk.overall_category
        )

        vuln_delta = VulnerabilityDelta(
            introduced_count=len(introduced_vulns),
            resolved_count=len(resolved_vulns),
            introduced_vulnerabilities=introduced_vulns,
            resolved_vulnerabilities=resolved_vulns
        )

        # 3. Construct Unified Nodes & Edges with visual semantics
        # Added: #22C55E (Green), Removed: #F05252 (Red), Modified: #4C8DCE (Steel Blue),
        # Unchanged: #19B6A4 (Teal), Vulnerable: #F05252 (Critical Red)
        unified_nodes: List[ComparisonNodeDiff] = []
        all_pkg_names = set(baseline_graph.nodes()) | set(simulated_graph.nodes()) | set(sim_res.diff.removed_nodes)

        for pkg in sorted(all_pkg_names):
            orig_ver = baseline_graph.nodes.get(pkg, {}).get("version") if pkg in baseline_graph else None
            sim_ver = simulated_graph.nodes.get(pkg, {}).get("version") if pkg in simulated_graph else None
            is_vuln = bool(sec_map.get(pkg))

            if pkg in sim_res.diff.added_nodes:
                status = "added"
                color = "#22C55E"  # Green
                badge = "+ Added"
            elif pkg in sim_res.diff.removed_nodes:
                status = "removed"
                color = "#F05252"  # Red
                badge = "- Removed"
            elif pkg in sim_res.diff.version_changes:
                status = "modified"
                color = "#4C8DCE"  # Steel Blue
                badge = f"v{orig_ver} -> v{sim_ver}"
            else:
                status = "unchanged"
                color = "#19B6A4"  # Teal
                badge = None

            # Vulnerability highlighting takes precedence
            if is_vuln and status != "removed":
                color = "#F05252"  # Red

            unified_nodes.append(ComparisonNodeDiff(
                id=pkg,
                label=pkg,
                status=status,
                original_version=orig_ver,
                simulated_version=sim_ver,
                is_vulnerable=is_vuln,
                highlight_color=color,
                badge_text=badge
            ))

        # Unified edges
        unified_edges: List[ComparisonEdgeDiff] = []
        seen_edges = set()

        for edge in sim_res.diff.added_edges:
            unified_edges.append(ComparisonEdgeDiff(
                source=edge.source,
                target=edge.target,
                status="added",
                version_constraint=edge.version_constraint,
                highlight_color="#22C55E"
            ))
            seen_edges.add((edge.source, edge.target))

        for edge in sim_res.diff.removed_edges:
            unified_edges.append(ComparisonEdgeDiff(
                source=edge.source,
                target=edge.target,
                status="removed",
                version_constraint=edge.version_constraint,
                highlight_color="#F05252"
            ))
            seen_edges.add((edge.source, edge.target))

        for u, v, data in baseline_graph.edges(data=True):
            if (u, v) not in seen_edges and simulated_graph.has_edge(u, v):
                unified_edges.append(ComparisonEdgeDiff(
                    source=u,
                    target=v,
                    status="unchanged",
                    version_constraint=data.get("version_constraint"),
                    highlight_color="#26364D"
                ))

        # Impact explanation
        explanation_parts = []
        if sim_res.impact_diff.newly_affected_packages:
            explanation_parts.append(
                f"Affects {len(sim_res.impact_diff.newly_affected_packages)} new downstream package(s): "
                f"{', '.join(sim_res.impact_diff.newly_affected_packages[:5])}"
                + (f" and {len(sim_res.impact_diff.newly_affected_packages) - 5} more" if len(sim_res.impact_diff.newly_affected_packages) > 5 else "")
            )
        if resolved_vulns:
            explanation_parts.append(f"Resolves {len(resolved_vulns)} security advisory(ies).")
        if risk_delta.score_change != 0:
            direction = "improves" if risk_delta.score_change < 0 else "increases"
            explanation_parts.append(f"Risk score {direction} by {abs(risk_delta.score_change):.1f} points ({baseline_risk.overall_score} -> {simulated_risk.overall_score}).")
        elif not explanation_parts:
            explanation_parts.append("No downstream blast radius expansion or vulnerability delta detected.")

        return GraphComparisonResponse(
            operation=str(request.operation.value if hasattr(request.operation, 'value') else request.operation),
            target_package=request.target_package,
            source_package=request.source_package or root_package,
            summary=sim_res.message,
            added_nodes=sim_res.diff.added_nodes,
            removed_nodes=sim_res.diff.removed_nodes,
            version_changes=sim_res.diff.version_changes,
            added_edges=sim_res.diff.added_edges,
            removed_edges=sim_res.diff.removed_edges,
            newly_affected_downstream=sim_res.impact_diff.newly_affected_packages,
            no_longer_affected_downstream=sim_res.impact_diff.no_longer_affected_packages,
            vulnerability_delta=vuln_delta,
            risk_delta=risk_delta,
            unified_nodes=unified_nodes,
            unified_edges=unified_edges,
            baseline_stats=sim_res.baseline_stats,
            simulated_stats=sim_res.simulated_stats,
            impact_explanation=" ".join(explanation_parts)
        )
