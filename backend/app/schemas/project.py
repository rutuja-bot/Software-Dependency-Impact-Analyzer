from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# --- Projects ---

class ProjectBase(BaseModel):
    name: str = Field(..., description="Project repository/service name")
    ecosystem: str = Field("npm", description="Package ecosystem, e.g. npm")
    description: Optional[str] = Field(None, description="Optional description of the project")

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    analysis_count: int = 0
    simulation_count: int = 0

# --- Analysis Runs & History ---

class AnalysisHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    project_version: Optional[str] = None
    status: str
    total_packages: int
    direct_dependencies_count: int
    transitive_dependencies_count: int
    total_dependency_edges: int
    has_cycles: bool
    cycle_count: int
    is_dag: bool
    created_at: datetime

class GraphSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    analysis_id: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    created_at: datetime

class AnalysisDetailResponse(AnalysisHistoryItem):
    project_name: Optional[str] = None
    topological_order: Optional[List[str]] = None
    cycle_details: Optional[List[Dict[str, Any]]] = None
    manifest_metadata: Optional[Dict[str, Any]] = None
    error_summary: Optional[str] = None
    graph_snapshot: Optional[GraphSnapshotResponse] = None

# --- Stored Security Findings ---

class StoredVulnerabilityFinding(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    analysis_id: str
    package_name: str
    package_version: Optional[str] = None
    vuln_id: str
    summary: Optional[str] = None
    details: Optional[str] = None
    severity: Optional[str] = None
    fixed_versions: Optional[List[str]] = None
    references: Optional[List[Dict[str, Any]]] = None
    scan_status: str
    created_at: datetime

class StoredSecurityResponse(BaseModel):
    analysis_id: str
    total_findings: int
    vulnerable_packages_count: int
    findings: List[StoredVulnerabilityFinding]

# --- Stored Freshness Records ---

class StoredFreshnessRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    analysis_id: str
    package_name: str
    installed_version: Optional[str] = None
    release_date: Optional[datetime] = None
    libyear: Optional[float] = None
    status: str
    reason_unscored: Optional[str] = None
    created_at: datetime

class StoredFreshnessResponse(BaseModel):
    analysis_id: str
    total_packages: int
    scored_packages_count: int
    unscored_packages_count: int
    project_total_libyear: Optional[float] = None
    project_average_libyear: Optional[float] = None
    records: List[StoredFreshnessRecord]

# --- Stored Simulation Runs ---

class SimulationRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    baseline_analysis_id: str
    operation: str
    target_package: str
    source_package: Optional[str] = None
    version: Optional[str] = None
    status: str
    message: Optional[str] = None
    diff: Dict[str, Any]
    cycle_diff: Dict[str, Any]
    impact_diff: Dict[str, Any]
    simulated_stats: Dict[str, Any]
    warnings: Optional[List[str]] = None
    created_at: datetime

# --- Database Status & Stats ---

class DatabaseStatusResponse(BaseModel):
    connected: bool
    status: str
    message: str
    total_projects: int = 0
    total_analyses: int = 0
    total_simulations: int = 0
