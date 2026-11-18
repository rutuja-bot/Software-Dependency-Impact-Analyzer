from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class FactorContribution(BaseModel):
    factor_name: str
    display_name: str
    raw_value: Any
    normalized_score: float = Field(..., description="Normalized 0-100 component score")
    weight: float = Field(..., description="Factor weight multiplier (sum of weights = 1.0)")
    weighted_score: float = Field(..., description="normalized_score * weight")
    explanation: str
    status: str = Field("scored", description="'scored', 'clean', 'unavailable', or 'unresolved'")

class PackageRiskScore(BaseModel):
    package_name: str
    version: Optional[str] = None
    dep_type: str = "direct"
    is_root: bool = False
    risk_score: float = Field(..., description="Overall 0-100 package risk score")
    risk_category: str = Field(..., description="low (0-24), moderate (25-49), high (50-74), critical (75-100)")
    factors: Dict[str, FactorContribution]
    summary_explanation: str
    vulnerabilities_count: int = 0
    max_vuln_severity: Optional[str] = None
    libyear_lag: Optional[float] = None
    downstream_dependents_count: int = 0
    criticality_score: float = 0.0

class ProjectRiskScore(BaseModel):
    project_name: str
    project_version: Optional[str] = "1.0.0"
    analysis_id: Optional[str] = None
    overall_score: float = Field(..., description="Project-level 0-100 composite risk score")
    overall_category: str = Field(..., description="low, moderate, high, critical")
    total_packages_evaluated: int
    critical_risk_packages_count: int
    high_risk_packages_count: int
    moderate_risk_packages_count: int
    low_risk_packages_count: int
    top_risky_packages: List[PackageRiskScore] = Field(default_factory=list)
    all_package_risks: List[PackageRiskScore] = Field(default_factory=list)
    factor_weights: Dict[str, float]
    factors: Dict[str, FactorContribution] = Field(default_factory=dict, description="Project-level factor contributions")
    peak_package_score: Optional[float] = None
    peak_package_name: Optional[str] = None
    methodology_notes: str
