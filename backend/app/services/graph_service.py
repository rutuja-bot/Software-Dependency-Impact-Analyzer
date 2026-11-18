from typing import Dict, List, Optional, Tuple, Set, Any
import networkx as nx

from app.schemas.graph import (
    DependencyType,
    PackageNode,
    DependencyEdge,
    GraphOverviewStats,
    CycleDetail,
    GraphAnalysisResponse,
    DownstreamImpactResponse
)
from app.schemas.impact import ImpactExplorerResponse
from app.parsers.nodejs import NormalizedProjectManifest

class DependencyGraphService:
    """
    Core graph construction and analysis service.
    
    Edge Convention:
    A -> B strictly means: 'Package A depends on Package B'.
    
    Graph Algorithms Used:
    - Directed Graph (NetworkX DiGraph)
    - Breadth-First Search (BFS) for depth exploration from root
    - Simple Cycles & Tarjan's SCC for circular dependency detection
    - Topological Sort (Kahn's / DFS-based) on DAGs
    - Reverse Graph Traversal for impact analysis
    """

    def __init__(self):
        pass

    def build_graph(self, manifest: NormalizedProjectManifest) -> nx.DiGraph:
        """
        Constructs a NetworkX DiGraph from the normalized manifest.
        Nodes represent packages (including the project root).
        Edges represent dependencies: Source -> Target (Source depends on Target).
        """
        G = nx.DiGraph()

        # Add root project node
        root_name = manifest.name
        G.add_node(
            root_name,
            version=manifest.version,
            is_root=True,
            dep_type=DependencyType.DIRECT,
            depth=0
        )

        # First pass: add all known packages
        for pkg_name, dep in manifest.dependencies.items():
            dep_type = DependencyType.DIRECT if dep.is_direct else DependencyType.TRANSITIVE
            if dep.is_dev:
                dep_type = DependencyType.DEV

            G.add_node(
                pkg_name,
                version=dep.resolved_version or dep.version_constraint,
                is_root=False,
                dep_type=dep_type,
                depth=1 if dep.is_direct else None
            )

            # Edge from root to direct dependencies
            if dep.is_direct:
                G.add_edge(
                    root_name,
                    pkg_name,
                    version_constraint=dep.version_constraint,
                    relation="depends_on"
                )

        # Second pass: add edges between packages (transitive relationships)
        for pkg_name, dep in manifest.dependencies.items():
            for child_name, child_constraint in dep.dependencies.items():
                # Ensure child exists as node
                if child_name not in G:
                    G.add_node(
                        child_name,
                        version=None,
                        is_root=False,
                        dep_type=DependencyType.TRANSITIVE,
                        depth=None
                    )
                G.add_edge(
                    pkg_name,
                    child_name,
                    version_constraint=child_constraint,
                    relation="depends_on"
                )

        # Compute BFS shortest path depth from root to all reachable nodes
        self._calculate_depths(G, root_name)

        return G

    def _calculate_depths(self, G: nx.DiGraph, root_name: str) -> None:
        """
        Computes BFS hop distance from root to each node.
        """
        if root_name not in G:
            return

        # Single source shortest path lengths in unweighted directed graph
        try:
            lengths = nx.single_source_shortest_path_length(G, root_name)
            for node, depth in lengths.items():
                G.nodes[node]["depth"] = depth
        except Exception:
            pass

    def analyze_graph(self, G: nx.DiGraph, root_name: str, project_version: Optional[str] = "1.0.0") -> GraphAnalysisResponse:
        """
        Executes graph algorithms to produce comprehensive metrics, cycles, and topological sorting.
        """
        # Node and Edge counts
        total_packages = G.number_of_nodes() - 1 if root_name in G else G.number_of_nodes()
        total_edges = G.number_of_edges()

        # Direct and Transitive identification
        direct_deps: List[str] = []
        transitive_deps: List[str] = []

        if root_name in G:
            direct_deps = sorted(list(G.successors(root_name)))
            # Transitive = all other non-root nodes
            for node in G.nodes():
                if node != root_name and node not in direct_deps:
                    transitive_deps.append(node)
            transitive_deps.sort()

        # Cycle detection
        is_dag = nx.is_directed_acyclic_graph(G)
        cycles_list: List[CycleDetail] = []

        if not is_dag:
            try:
                # Find elementary cycles (capped at 50 to avoid combinatorial explosion)
                for c in nx.simple_cycles(G):
                    # Format as full loop path A -> B -> A
                    formatted_path = c + [c[0]]
                    cycles_list.append(CycleDetail(
                        cycle_path=formatted_path,
                        cycle_length=len(c)
                    ))
                    if len(cycles_list) >= 50:
                        break
            except Exception:
                pass

        # Topological sorting (valid only if DAG)
        topological_order: Optional[List[str]] = None
        if is_dag:
            try:
                topological_order = list(nx.topological_sort(G))
            except Exception:
                topological_order = None

        # Build stats
        stats = GraphOverviewStats(
            total_packages=max(0, total_packages),
            direct_dependencies_count=len(direct_deps),
            transitive_dependencies_count=len(transitive_deps),
            total_dependency_edges=total_edges,
            has_cycles=not is_dag,
            cycle_count=len(cycles_list),
            is_dag=is_dag,
            root_package=root_name
        )

        # Serialize Nodes
        nodes_out: List[PackageNode] = []
        for n, data in G.nodes(data=True):
            nodes_out.append(PackageNode(
                name=n,
                version=data.get("version"),
                is_root=bool(data.get("is_root", False)),
                dep_type=data.get("dep_type", DependencyType.TRANSITIVE),
                depth=data.get("depth"),
                out_degree=G.out_degree(n),
                in_degree=G.in_degree(n)
            ))

        # Serialize Edges
        edges_out: List[DependencyEdge] = []
        for u, v, data in G.edges(data=True):
            edges_out.append(DependencyEdge(
                source=u,
                target=v,
                version_constraint=data.get("version_constraint"),
                relation=data.get("relation", "depends_on")
            ))

        return GraphAnalysisResponse(
            project_name=root_name,
            project_version=project_version,
            stats=stats,
            nodes=nodes_out,
            edges=edges_out,
            cycles=cycles_list,
            topological_order=topological_order,
            direct_dependencies=direct_deps,
            transitive_dependencies=transitive_deps
        )

    def find_affected_downstream_packages(self, G: nx.DiGraph, target_package: str) -> DownstreamImpactResponse:
        """
        Reverse Dependency Analysis:
        If package A -> B (A depends on B), then changing B directly impacts A.
        To find all packages affected by target B, we traverse the reverse graph (G.reverse())
        starting from B using BFS/DFS.
        """
        if target_package not in G:
            return DownstreamImpactResponse(
                target_package=target_package,
                affected_packages=[],
                affected_count=0,
                reverse_dependency_paths={}
            )

        R = G.reverse(copy=False)
        # All nodes reachable from target_package in R are the downstream dependents
        affected_set = set(nx.descendants(R, target_package))

        # Build sample shortest paths from each affected node to the target package
        sample_paths: Dict[str, List[List[str]]] = {}
        for aff in affected_set:
            try:
                # In the original graph G, path goes from affected package -> target_package
                path = nx.shortest_path(G, source=aff, target=target_package)
                sample_paths[aff] = [path]
            except Exception:
                pass

        affected_list = sorted(list(affected_set))
        return DownstreamImpactResponse(
            target_package=target_package,
            affected_packages=affected_list,
            affected_count=len(affected_list),
            reverse_dependency_paths=sample_paths
        )

    def explore_impact(
        self,
        G: nx.DiGraph,
        target_package: str,
        max_paths: int = 50,
        security_findings: Optional[List[Any]] = None
    ) -> ImpactExplorerResponse:
        """
        Comprehensive Dependency Impact Explorer traversal.

        Distinguishes:
        1. Direct Dependencies: Outgoing edges (Target -> Package, packages the target depends on)
        2. Direct Dependents: Incoming edges (Package -> Target, packages that directly depend on target)
        3. Transitive Dependents: Cascade reachability in reverse graph R with distance >= 2
        4. All Downstream Affected Packages: All reachable nodes in R
        5. Exact shortest dependency paths connecting affected packages down to target
        """
        if target_package not in G:
            return ImpactExplorerResponse(
                target_package=target_package,
                target_node=None,
                direct_dependencies=[],
                direct_dependencies_count=0,
                direct_dependents=[],
                direct_dependents_count=0,
                transitive_dependents=[],
                transitive_dependents_count=0,
                all_downstream_affected=[],
                total_affected_count=0,
                dependency_paths={}
            )

        def _make_node(name: str) -> PackageNode:
            data = G.nodes[name] if name in G else {}
            return PackageNode(
                name=name,
                version=data.get("version"),
                is_root=bool(data.get("is_root", False)),
                dep_type=data.get("dep_type", DependencyType.TRANSITIVE),
                depth=data.get("depth"),
                out_degree=G.out_degree(name) if name in G else 0,
                in_degree=G.in_degree(name) if name in G else 0
            )

        target_node = _make_node(target_package)

        # 1. Direct dependencies: Outgoing edges (target -> dep)
        outgoing_names = sorted(list(G.successors(target_package)))
        direct_dependencies = [_make_node(name) for name in outgoing_names]

        # 2. Direct dependents: Incoming edges (dep -> target)
        incoming_names = sorted(list(G.predecessors(target_package)))
        direct_dependents = [_make_node(name) for name in incoming_names]

        # 3. Transitive dependents via reverse graph traversal (R: edges flipped)
        R = G.reverse(copy=False)
        try:
            lengths_in_R = nx.single_source_shortest_path_length(R, target_package)
        except Exception:
            lengths_in_R = {target_package: 0}

        transitive_names: List[str] = []
        for node, dist in lengths_in_R.items():
            if node != target_package and dist >= 2:
                transitive_names.append(node)
        transitive_names.sort()
        transitive_dependents = [_make_node(name) for name in transitive_names]

        # 4. All downstream affected packages (all nodes in R with dist >= 1)
        all_affected = sorted([node for node, dist in lengths_in_R.items() if node != target_package])

        # 5. Exact dependency paths from affected packages down to target
        dependency_paths: Dict[str, List[List[str]]] = {}
        for aff in all_affected[:max_paths]:
            try:
                # In original graph G: path goes aff -> ... -> target_package
                p = nx.shortest_path(G, source=aff, target=target_package)
                dependency_paths[aff] = [p]
            except Exception:
                pass

        # 6. Security status for target if findings provided
        vuln_status = "clean"
        vuln_count = 0
        advisories: List[Dict[str, Any]] = []

        if security_findings:
            for f in security_findings:
                pkg_name = f.get("package_name") if isinstance(f, dict) else getattr(f, "package_name", None)
                scan_status = f.get("scan_status") if isinstance(f, dict) else getattr(f, "scan_status", "clean")
                if pkg_name == target_package and scan_status == "vulnerable":
                    vuln_count += 1
                    vuln_id = f.get("vuln_id") if isinstance(f, dict) else getattr(f, "vuln_id", "VULN")
                    summary = f.get("summary") if isinstance(f, dict) else getattr(f, "summary", "")
                    severity = f.get("severity") if isinstance(f, dict) else getattr(f, "severity", None)
                    advisories.append({"id": vuln_id, "summary": summary, "severity": severity})

            if vuln_count > 0:
                vuln_status = "vulnerable"

        return ImpactExplorerResponse(
            target_package=target_package,
            target_node=target_node,
            direct_dependencies=direct_dependencies,
            direct_dependencies_count=len(direct_dependencies),
            direct_dependents=direct_dependents,
            direct_dependents_count=len(direct_dependents),
            transitive_dependents=transitive_dependents,
            transitive_dependents_count=len(transitive_dependents),
            all_downstream_affected=all_affected,
            total_affected_count=len(all_affected),
            dependency_paths=dependency_paths,
            vulnerability_status=vuln_status,
            vulnerabilities_count=vuln_count,
            vulnerability_advisories=advisories
        )
