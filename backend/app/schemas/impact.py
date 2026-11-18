from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from app.schemas.graph import PackageNode, DependencyEdge

class DependencyPathItem(BaseModel):
    dependent_package: str
    path: List[str] = Field(..., description="Ordered path from dependent to target package: [dependent, ..., target]")
    depth: int

class ImpactExplorerResponse(BaseModel):
    target_package: str
    target_node: Optional[PackageNode] = Field(None, description="Metadata of the inspected target package")
    
    # Direct dependencies (outgoing: what target depends on)
    direct_dependencies: List[PackageNode] = Field(default_factory=list, description="Packages this package directly depends on (outgoing edges)")
    direct_dependencies_count: int = 0
    
    # Direct dependents (incoming: packages that directly depend on target)
    direct_dependents: List[PackageNode] = Field(default_factory=list, description="Packages that directly depend on this package (incoming edges)")
    direct_dependents_count: int = 0
    
    # Transitive dependents (cascade reachability in reverse graph with hop >= 2)
    transitive_dependents: List[PackageNode] = Field(default_factory=list, description="Transitive dependents affected via intermediate packages")
    transitive_dependents_count: int = 0
    
    # All downstream affected packages
    all_downstream_affected: List[str] = Field(default_factory=list, description="All packages that would be impacted if this package changes")
    total_affected_count: int = 0
    
    # Exact paths from affected packages to target (paginated/capped)
    dependency_paths: Dict[str, List[List[str]]] = Field(default_factory=dict, description="Exact paths from dependent packages to target")
    
    # Optional security context for target
    vulnerability_status: Optional[str] = Field("clean", description="clean, vulnerable, or unscanned")
    vulnerabilities_count: int = 0
    vulnerability_advisories: List[Dict[str, Any]] = Field(default_factory=list)
