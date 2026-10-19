import json
import logging
from typing import Dict, List, Optional, Any
import requests

from app.core.config import settings
from app.schemas.security import (
    VulnerabilityRecord,
    VulnerabilityReference,
    PackageSecurityResult,
    SecurityScanResponse
)

logger = logging.getLogger(__name__)

class OsvSecurityService:
    """
    Dedicated client for querying Open Source Vulnerabilities (OSV) API.
    Ecosystem: npm (Node.js)
    Endpoint: https://api.osv.dev/v1/query
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None
    ):
        self.base_url = base_url or settings.OSV_API_BASE_URL
        self.timeout_seconds = timeout_seconds or settings.OSV_TIMEOUT_SECONDS

    def query_package(self, package_name: str, version: str) -> PackageSecurityResult:
        """
        Queries OSV for a single package and concrete version.
        Guarantees safe execution with strict timeout and no exceptions leaked.
        """
        clean_name = package_name.strip()
        clean_version = version.strip()

        # Reject constraints like ^, ~, >=, *
        if any(c in clean_version for c in ("^", "~", ">", "<", "*", " ")):
            return PackageSecurityResult(
                package_name=clean_name,
                version=clean_version,
                status="unresolved",
                error_message="Version is a loose range constraint, not a concrete installed version."
            )

        payload = {
            "version": clean_version,
            "package": {
                "name": clean_name,
                "ecosystem": "npm"
            }
        }

        try:
            response = requests.post(
                self.base_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "DependencyImpactAnalyzer/0.1.0"},
                timeout=self.timeout_seconds
            )

            if response.status_code == 200:
                data = response.json()
                vulns_raw = data.get("vulns", [])
                if not vulns_raw:
                    return PackageSecurityResult(
                        package_name=clean_name,
                        version=clean_version,
                        status="clean",
                        vulnerabilities=[]
                    )

                parsed_vulns: List[VulnerabilityRecord] = []
                for v in vulns_raw:
                    vuln_id = v.get("id", "UNKNOWN-ID")
                    summary = v.get("summary")
                    details = v.get("details")
                    published = v.get("published")
                    modified = v.get("modified")

                    # Extract severity if present (CVSS score or type)
                    severity_str = None
                    severity_list = v.get("severity", [])
                    if isinstance(severity_list, list) and severity_list:
                        sev_entry = severity_list[0]
                        if isinstance(sev_entry, dict):
                            severity_str = f"{sev_entry.get('type', '')} {sev_entry.get('score', '')}".strip() or None

                    # Extract fixed versions from affected ranges for the queried package
                    fixed_versions: List[str] = []
                    affected_list = v.get("affected", [])
                    if isinstance(affected_list, list):
                        for aff in affected_list:
                            if isinstance(aff, dict):
                                aff_pkg = aff.get("package", {})
                                aff_pkg_name = aff_pkg.get("name") if isinstance(aff_pkg, dict) else None
                                # Only pull fixes if package name matches or if package name is omitted
                                if aff_pkg_name and aff_pkg_name.lower() != clean_name.lower():
                                    continue
                                ranges = aff.get("ranges", [])
                                if isinstance(ranges, list):
                                    for r in ranges:
                                        if isinstance(r, dict):
                                            for event in r.get("events", []):
                                                if isinstance(event, dict) and "fixed" in event:
                                                    fixed_versions.append(str(event["fixed"]))

                    # Extract references
                    ref_objs: List[VulnerabilityReference] = []
                    for r in v.get("references", []):
                        if isinstance(r, dict) and "url" in r:
                            ref_objs.append(VulnerabilityReference(type=r.get("type"), url=r["url"]))

                    parsed_vulns.append(VulnerabilityRecord(
                        id=vuln_id,
                        summary=summary,
                        details=details,
                        published=published,
                        modified=modified,
                        severity=severity_str,
                        affected_version=clean_version,
                        fixed_versions=sorted(list(set(fixed_versions))),
                        references=ref_objs
                    ))

                return PackageSecurityResult(
                    package_name=clean_name,
                    version=clean_version,
                    status="vulnerable",
                    vulnerabilities=parsed_vulns
                )

            elif response.status_code == 404:
                return PackageSecurityResult(
                    package_name=clean_name,
                    version=clean_version,
                    status="error",
                    error_message="OSV API returned 404: Package not found in OSV ecosystem database."
                )
            else:
                return PackageSecurityResult(
                    package_name=clean_name,
                    version=clean_version,
                    status="error",
                    error_message=f"OSV HTTP {response.status_code}: {response.text[:120]}"
                )

        except requests.exceptions.Timeout:
            return PackageSecurityResult(
                package_name=clean_name,
                version=clean_version,
                status="error",
                error_message="OSV API request timed out."
            )
        except requests.exceptions.RequestException as e:
            return PackageSecurityResult(
                package_name=clean_name,
                version=clean_version,
                status="error",
                error_message=f"OSV connection error: {str(e)}"
            )
        except Exception as e:
            return PackageSecurityResult(
                package_name=clean_name,
                version=clean_version,
                status="error",
                error_message=f"Failed to parse OSV response: {str(e)}"
            )

    def scan_packages(self, packages: List[Dict[str, Optional[str]]]) -> SecurityScanResponse:
        """
        Batch-scans a collection of packages: [{'name': 'express', 'version': '4.18.2'}, ...]
        Deduplicates queries and preserves isolated partial failures.
        """
        results: List[PackageSecurityResult] = []
        unresolved: List[str] = []
        warnings: List[str] = []

        seen_queries: Dict[str, PackageSecurityResult] = {}

        for pkg in packages:
            name = (pkg.get("name") or "").strip()
            version = (pkg.get("version") or "").strip()

            if not name:
                continue

            # Check if version is missing or cannot be verified
            if not version or version.lower() in ("none", "null", "simulated", "unknown"):
                res = PackageSecurityResult(
                    package_name=name,
                    version=version or None,
                    status="unresolved",
                    error_message="No resolved concrete version available from manifest/lockfile."
                )
                results.append(res)
                unresolved.append(name)
                continue

            query_key = f"{name}@{version}"
            if query_key in seen_queries:
                results.append(seen_queries[query_key])
                continue

            result = self.query_package(name, version)
            seen_queries[query_key] = result
            results.append(result)

            if result.status in ("unresolved", "error"):
                unresolved.append(name)
                if result.error_message:
                    warnings.append(f"{name}@{version}: {result.error_message}")

        vulnerable_count = sum(1 for r in results if r.status == "vulnerable")
        clean_count = sum(1 for r in results if r.status == "clean")
        unresolved_count = len(unresolved)
        total_vulns = sum(len(r.vulnerabilities) for r in results)

        status = "completed"
        if unresolved_count == len(results) and len(results) > 0:
            status = "failed"
        elif unresolved_count > 0:
            status = "partial"

        return SecurityScanResponse(
            status=status,
            total_packages_checked=len(results),
            vulnerable_packages_count=vulnerable_count,
            clean_packages_count=clean_count,
            unresolved_packages_count=unresolved_count,
            total_vulnerabilities_count=total_vulns,
            results=results,
            unresolved_packages=sorted(list(set(unresolved))),
            warnings=warnings
        )
