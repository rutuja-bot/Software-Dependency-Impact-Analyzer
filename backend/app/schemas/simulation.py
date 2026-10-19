from enum import Enum
from typing import List, Dict, Optional, Any, Set
from pydantic import BaseModel, Field
from app.schemas.graph import (
    DependencyType,
    PackageNode,
    DependencyEdge,
    GraphOverviewStats,
    CycleDetail,
    GraphAnalysisResponse
)

class SimulationOperationType(str, Enum):
    ADD = "add"
    REMOVE = "remove"
    UPGRADE = "upgrade"

class SimulationRequest(BaseModel):
    operation: SimulationOperationType = Field(..., description="Simulation operation: add, remove, or upgrade")
    target_package: str = Field(..., description="Target package name to add, remove, or upgrade")
    source_package: Optional[str] = Field(None, description="Source package that depends on target; defaults to project root if None")
    version: Optional[str] = Field(None, description="Proposed version or constraint (required for upgrade, optional for add)")
    dep_type: Optional[DependencyType] = Field(DependencyType.DIRECT, description="Dependency classification: direct or dev")

class GraphDiff(BaseModel):
    added_nodes: List[str] = Field(default_factory=list, description="Packages newly added in simulated graph")
    removed_nodes: List[str] = Field(default_factory=list, description="Packages removed in simulated graph")
    added_edges: List[DependencyEdge] = Field(default_factory=list, description="New dependency links introduced")
    removed_edges: List[DependencyEdge] = Field(default_factory=list, description="Dependency links removed")
    orphaned_nodes: List[str] = Field(
        default_factory=list, 
        description="Packages that became unreachable from the root node as a consequence of edge removal"
    )
    version_changes: Dict[str, Dict[str, Optional[str]]] = Field(
        default_factory=dict,
        description="Mapping of pkg -> {'original_version': x, 'simulated_version': y}"
    )

class CycleDiff(BaseModel):
    introduced_cycles: List[CycleDetail] = Field(default_factory=list, description="Newly formed circular loops")
    eliminated_cycles: List[CycleDetail] = Field(default_factory=list, description="Circular loops broken by the change")
    baseline_cycle_count: int
    simulated_cycle_count: int

class DownstreamImpactDiff(BaseModel):
    target_package: str
    baseline_affected_count: int
    simulated_affected_count: int
    newly_affected_packages: List[str] = Field(default_factory=list)
    no_longer_affected_packages: List[str] = Field(default_factory=list)

class SimulationResponse(BaseModel):
    operation: SimulationOperationType
    target_package: str
    source_package: str
    message: str
    baseline_stats: GraphOverviewStats
    simulated_stats: GraphOverviewStats
    diff: GraphDiff
    cycle_diff: CycleDiff
    impact_diff: DownstreamImpactDiff
    simulated_analysis: GraphAnalysisResponse
    warnings: List[str] = Field(default_factory=list)
