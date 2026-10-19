from enum import Enum
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class DependencyType(str, Enum):
    DIRECT = "direct"
    TRANSITIVE = "transitive"
    DEV = "dev"
    PEER = "peer"
    OPTIONAL = "optional"

class PackageNode(BaseModel):
    name: str = Field(..., description="Unique package name or root identifier")
    version: Optional[str] = Field(None, description="Resolved or declared package version")
    is_root: bool = Field(False, description="Whether this node represents the inspected project root")
    dep_type: DependencyType = Field(DependencyType.DIRECT, description="Classification of dependency")
    depth: Optional[int] = Field(None, description="Shortest hop distance from the root node")
    out_degree: Optional[int] = Field(None, description="Number of packages this package directly depends on")
    in_degree: Optional[int] = Field(None, description="Number of packages that depend on this package")

class DependencyEdge(BaseModel):
    source: str = Field(..., description="Source package name (e.g. Package A)")
    target: str = Field(..., description="Target package name (e.g. Package B)")
    version_constraint: Optional[str] = Field(None, description="Declared SemVer requirement (e.g. ^16.8.0)")
    relation: str = Field("depends_on", description="Standard edge convention: A -> B means A depends on B")

class ProjectManifestInput(BaseModel):
    package_json: Dict[str, Any] = Field(..., description="Parsed or raw JSON object of package.json")
    package_lock_json: Optional[Dict[str, Any]] = Field(None, description="Optional package-lock.json object")

class GraphOverviewStats(BaseModel):
    total_packages: int
    direct_dependencies_count: int
    transitive_dependencies_count: int
    total_dependency_edges: int
    has_cycles: bool
    cycle_count: int
    is_dag: bool
    root_package: str

class CycleDetail(BaseModel):
    cycle_path: List[str] = Field(..., description="Ordered list of package names forming a cycle")
    cycle_length: int

class GraphAnalysisResponse(BaseModel):
    project_name: str
    project_version: Optional[str] = None
    stats: GraphOverviewStats
    nodes: List[PackageNode]
    edges: List[DependencyEdge]
    cycles: List[CycleDetail] = Field(default_factory=list)
    topological_order: Optional[List[str]] = Field(None, description="Valid evaluation order if DAG; None if cyclic")
    direct_dependencies: List[str] = Field(default_factory=list)
    transitive_dependencies: List[str] = Field(default_factory=list)

class DownstreamImpactResponse(BaseModel):
    target_package: str
    affected_packages: List[str] = Field(..., description="Downstream packages that depend on the target directly or transitively")
    affected_count: int
    reverse_dependency_paths: Dict[str, List[List[str]]] = Field(
        default_factory=dict,
        description="Sample shortest paths from affected packages down to the target package"
    )

class HealthResponse(BaseModel):
    status: str
    version: str
    project: str
    timestamp: Optional[str] = None

class InfoResponse(BaseModel):
    project_name: str
    version: str
    description: str
    supported_ecosystems: List[str]
    supported_lockfile_versions: List[int]
    edge_convention: str
    implemented_features: List[str]
    planned_features: List[str]
