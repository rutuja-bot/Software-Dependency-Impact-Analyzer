from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from app.schemas.graph import DependencyEdge, GraphOverviewStats

class ComparisonNodeDiff(BaseModel):
    id: str
    label: str
    status: str = Field(..., description="'added', 'removed', 'modified', or 'unchanged'")
    original_version: Optional[str] = None
    simulated_version: Optional[str] = None
    is_vulnerable: bool = False
    vulnerability_severity: Optional[str] = None
    highlight_color: str
    badge_text: Optional[str] = None

class ComparisonEdgeDiff(BaseModel):
    source: str
    target: str
    status: str = Field(..., description="'added', 'removed', or 'unchanged'")
    version_constraint: Optional[str] = None
    highlight_color: str

class VulnerabilityDelta(BaseModel):
    introduced_count: int = 0
    resolved_count: int = 0
    introduced_vulnerabilities: List[Dict[str, Any]] = Field(default_factory=list)
    resolved_vulnerabilities: List[Dict[str, Any]] = Field(default_factory=list)

class RiskScoreDelta(BaseModel):
    baseline_score: float
    simulated_score: float
    score_change: float = Field(..., description="simulated_score - baseline_score")
    baseline_category: str
    simulated_category: str
    category_changed: bool = False

class GraphComparisonResponse(BaseModel):
    operation: str
    target_package: str
    source_package: Optional[str] = None
    summary: str
    added_nodes: List[str] = Field(default_factory=list)
    removed_nodes: List[str] = Field(default_factory=list)
    version_changes: Dict[str, Dict[str, Optional[str]]] = Field(default_factory=dict)
    added_edges: List[DependencyEdge] = Field(default_factory=list)
    removed_edges: List[DependencyEdge] = Field(default_factory=list)
    newly_affected_downstream: List[str] = Field(default_factory=list)
    no_longer_affected_downstream: List[str] = Field(default_factory=list)
    vulnerability_delta: VulnerabilityDelta
    risk_delta: RiskScoreDelta
    unified_nodes: List[ComparisonNodeDiff] = Field(default_factory=list)
    unified_edges: List[ComparisonEdgeDiff] = Field(default_factory=list)
    baseline_stats: GraphOverviewStats
    simulated_stats: GraphOverviewStats
    impact_explanation: str
