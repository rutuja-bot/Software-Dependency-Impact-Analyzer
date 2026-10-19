from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class VulnerabilityReference(BaseModel):
    type: Optional[str] = None
    url: str

class VulnerabilityRecord(BaseModel):
    id: str = Field(..., description="Vulnerability ID, e.g. GHSA-xxxx or CVE-xxxx")
    summary: Optional[str] = Field(None, description="Short summary of the security advisory")
    details: Optional[str] = Field(None, description="Detailed vulnerability description")
    published: Optional[str] = Field(None, description="ISO-8601 published timestamp")
    modified: Optional[str] = Field(None, description="ISO-8601 last modified timestamp")
    severity: Optional[str] = Field(None, description="CVSS or advisory severity if provided by OSV")
    affected_version: Optional[str] = Field(None, description="Version examined")
    fixed_versions: List[str] = Field(default_factory=list, description="Fixed versions extracted from affected ranges")
    references: List[VulnerabilityReference] = Field(default_factory=list, description="External reference links")

class PackageSecurityResult(BaseModel):
    package_name: str
    version: Optional[str] = None
    status: str = Field(..., description="'vulnerable', 'clean', 'unresolved', or 'error'")
    vulnerabilities: List[VulnerabilityRecord] = Field(default_factory=list)
    error_message: Optional[str] = None

class SecurityScanResponse(BaseModel):
    status: str = Field(..., description="'completed', 'partial', or 'failed'")
    total_packages_checked: int
    vulnerable_packages_count: int
    clean_packages_count: int
    unresolved_packages_count: int
    total_vulnerabilities_count: int
    results: List[PackageSecurityResult] = Field(default_factory=list)
    unresolved_packages: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

class PackageFreshnessResult(BaseModel):
    package_name: str
    version: Optional[str] = None
    status: str = Field(..., description="'scored', 'unscored', or 'invalid'")
    release_date: Optional[str] = Field(None, description="ISO-8601 release date of the installed version")
    analysis_date: str = Field(..., description="ISO-8601 analysis date baseline")
    libyear: Optional[float] = Field(None, description="Freshness lag in years: max(0, analysis_date - release_date)")
    reason_unscored: Optional[str] = None
    category: Optional[str] = Field(None, description="'scored', 'lookup_failed', or 'unresolved_version'")

class FreshnessAnalysisResponse(BaseModel):
    status: str = Field(..., description="'completed' or 'empty'")
    analysis_date: str
    total_packages: int
    scored_packages_count: int
    unscored_packages_count: int
    project_total_libyear: float = Field(0.0, description="Sum of LibYear scores across all eligible packages")
    project_average_libyear: float = Field(0.0, description="Average LibYear score across eligible (scored) packages")
    results: List[PackageFreshnessResult] = Field(default_factory=list)
    unscored_packages: List[str] = Field(default_factory=list)
    failed_lookup_packages: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
