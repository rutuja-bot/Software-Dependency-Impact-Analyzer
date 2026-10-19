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
from app.services.graph_service import DependencyGraphService

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

            # Calculate unreachable (orphaned) packages from root
            reachable_from_root = set(nx.descendants(simulated_graph, root_package)) | {root_package}
            all_non_root_nodes = set(simulated_graph.nodes()) - {root_package}
            orphaned = all_non_root_nodes - reachable_from_root
            orphaned_nodes = sorted(list(orphaned))

            # If target has in-degree 0 in simulated graph, it is removed as a node from simulated graph
            if simulated_graph.in_degree(target_pkg) == 0 and target_pkg != root_package:
                simulated_graph.remove_node(target_pkg)
                removed_nodes.append(target_pkg)

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
