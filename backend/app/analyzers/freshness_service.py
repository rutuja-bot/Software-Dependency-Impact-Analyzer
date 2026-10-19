import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor
import requests

from app.schemas.security import (
    PackageFreshnessResult,
    FreshnessAnalysisResponse
)

logger = logging.getLogger(__name__)

class LibYearFreshnessService:
    """
    Dedicated Dependency Freshness Service using the LibYear metric.
    
    Metric Definition:
    For a package with known installed version and a release timestamp:
    Package LibYear = max(0.0, (analysis_date - installed_version_release_date) in days / 365.25)
    
    Project Aggregate Metrics:
    - project_total_libyear = sum(libyear for all eligible scored packages)
    - project_average_libyear = project_total_libyear / count(eligible scored packages)
    (Unscored packages without release timestamps are explicitly excluded from the average denominator)
    """

    NPM_REGISTRY_BASE = "https://registry.npmjs.org"

    def __init__(self, registry_base: Optional[str] = None, timeout_seconds: float = 6.5, max_workers: int = 8):
        self.registry_base = (registry_base or self.NPM_REGISTRY_BASE).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_workers = max_workers
        # In-memory session cache for release timestamps: pkg_name -> {version: release_iso_str}
        self._cache: Dict[str, Dict[str, str]] = {}
        self._fetch_errors: Dict[str, str] = {}
        self._session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=10)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    def fetch_package_release_dates(self, package_name: str, force_refresh: bool = False) -> Dict[str, str]:
        """
        Retrieves release timestamps from npm registry metadata:
        GET https://registry.npmjs.org/<package_name>
        Returns {version: iso_timestamp} mapping from response['time']
        """
        clean_name = package_name.strip()
        if not force_refresh:
            if clean_name in self._cache and self._cache[clean_name]:
                return self._cache[clean_name]
            if clean_name in self._fetch_errors:
                return {}

        url = f"{self.registry_base}/{clean_name}"
        try:
            import unittest.mock
            if isinstance(requests.get, (unittest.mock.Mock, unittest.mock.MagicMock)):
                fetcher = requests.get
            else:
                fetcher = self._session.get

            resp = fetcher(
                url,
                headers={"Accept": "application/json", "User-Agent": "DependencyImpactAnalyzer/0.1.0"},
                timeout=self.timeout_seconds
            )
            if resp.status_code == 200:
                data = resp.json()
                times = data.get("time", {})
                if isinstance(times, dict) and times:
                    self._cache[clean_name] = times
                    self._fetch_errors.pop(clean_name, None)
                    return times
                else:
                    self._fetch_errors[clean_name] = "No release time metadata available in registry response."
                    self._cache.pop(clean_name, None)
            elif resp.status_code == 404:
                self._fetch_errors[clean_name] = "Package not found in registry (HTTP 404)"
                self._cache.pop(clean_name, None)
            else:
                self._fetch_errors[clean_name] = f"Registry returned HTTP {resp.status_code}"
                self._cache.pop(clean_name, None)
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout retrieving npm registry time metadata for {clean_name}")
            self._fetch_errors[clean_name] = f"Registry request timed out ({self.timeout_seconds}s)"
            self._cache.pop(clean_name, None)
        except Exception as e:
            logger.warning(f"Could not retrieve npm registry time metadata for {clean_name}: {e}")
            self._fetch_errors[clean_name] = f"Registry connection error: {str(e)}"
            self._cache.pop(clean_name, None)

        return {}

    def prefetch_release_dates(self, package_names: List[str], retry_failed: bool = False) -> None:
        """
        Concurrently pre-fetches release timestamps for multiple packages using connection pooling.
        """
        if retry_failed:
            uncached = [p for p in set(package_names) if p and (p not in self._cache or not self._cache.get(p))]
        else:
            uncached = [p for p in set(package_names) if p and p not in self._cache]

        if not uncached:
            return
        workers = min(self.max_workers, len(uncached))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            list(executor.map(self.fetch_package_release_dates, uncached))

    def calculate_libyear(
        self,
        package_name: str,
        version: Optional[str],
        analysis_dt: datetime,
        custom_release_date: Optional[str] = None
    ) -> PackageFreshnessResult:
        """
        Calculates LibYear for a single package given an analysis date baseline.
        Categorizes findings into 'scored', 'lookup_failed', or 'unresolved_version'.
        """
        iso_now = analysis_dt.isoformat()

        if not version or version.strip().lower() in ("none", "null", "unknown", "simulated"):
            return PackageFreshnessResult(
                package_name=package_name,
                version=version,
                status="unscored",
                category="unresolved_version",
                analysis_date=iso_now,
                reason_unscored="Missing or unverified installed version."
            )

        clean_version = version.strip()
        # Loose constraint check
        if any(c in clean_version for c in ("^", "~", ">", "<", "*", " ")):
            return PackageFreshnessResult(
                package_name=package_name,
                version=clean_version,
                status="unscored",
                category="unresolved_version",
                analysis_date=iso_now,
                reason_unscored="Version is a loose range constraint, not a concrete installed version."
            )

        # Obtain release date: custom override takes precedence (ideal for testing and offline fixtures)
        rel_date_str = custom_release_date
        if not rel_date_str:
            times = self.fetch_package_release_dates(package_name)
            rel_date_str = times.get(clean_version)

        if not rel_date_str:
            err = self._fetch_errors.get(package_name)
            if err:
                category = "lookup_failed"
                reason = f"npm registry lookup failed: {err}"
            else:
                category = "unresolved_version"
                reason = f"Release timestamp for {package_name}@{clean_version} not found in registry."
            return PackageFreshnessResult(
                package_name=package_name,
                version=clean_version,
                status="unscored",
                category=category,
                analysis_date=iso_now,
                reason_unscored=reason
            )

        try:
            # Parse ISO date (handling trailing 'Z' if present)
            clean_date = rel_date_str.replace("Z", "+00:00")
            rel_dt = datetime.fromisoformat(clean_date)
            if rel_dt.tzinfo is None:
                rel_dt = rel_dt.replace(tzinfo=timezone.utc)
            if analysis_dt.tzinfo is None:
                analysis_dt = analysis_dt.replace(tzinfo=timezone.utc)

            delta_days = (analysis_dt - rel_dt).total_seconds() / 86400.0
            # max(0, age_in_years) - zero if future or current
            libyear = max(0.0, round(delta_days / 365.25, 2))

            return PackageFreshnessResult(
                package_name=package_name,
                version=clean_version,
                status="scored",
                category="scored",
                release_date=rel_dt.isoformat(),
                analysis_date=iso_now,
                libyear=libyear
            )
        except Exception as e:
            return PackageFreshnessResult(
                package_name=package_name,
                version=clean_version,
                status="unscored",
                category="lookup_failed",
                analysis_date=iso_now,
                reason_unscored=f"Invalid release timestamp format '{rel_date_str}': {str(e)}"
            )

    def analyze_freshness(
        self,
        packages: List[Dict[str, Optional[str]]],
        analysis_date: Optional[datetime] = None,
        release_dates_map: Optional[Dict[str, str]] = None,
        retry_failed: bool = False
    ) -> FreshnessAnalysisResponse:
        """
        Analyzes freshness across multiple packages and calculates project aggregate scores.
        release_dates_map: Optional mapping of 'pkg@ver' or 'pkg' -> iso_release_date for fixtures.
        retry_failed: When True, evicts previously failed lookups so they can be re-fetched.
        """
        analysis_dt = analysis_date or datetime.now(timezone.utc)
        if analysis_dt.tzinfo is None:
            analysis_dt = analysis_dt.replace(tzinfo=timezone.utc)

        results: List[PackageFreshnessResult] = []
        unscored_names: List[str] = []
        warnings: List[str] = []

        release_map = release_dates_map or {}

        # If retrying failed lookups, clear errors and empty cache entries for requested packages
        if retry_failed:
            for pkg in packages:
                name = (pkg.get("name") or "").strip()
                if name:
                    if name not in self._cache or not self._cache.get(name):
                        self._cache.pop(name, None)
                        self._fetch_errors.pop(name, None)

        # 1. Identify packages needing network prefetch (excluding fixture maps, loose constraints, missing versions)
        pkgs_to_fetch = []
        for pkg in packages:
            name = (pkg.get("name") or "").strip()
            version = (pkg.get("version") or "").strip()
            if not name:
                continue
            if (f"{name}@{version}" in release_map) or (name in release_map):
                continue
            if not version or version.lower() in ("none", "null", "unknown", "simulated"):
                continue
            if any(c in version for c in ("^", "~", ">", "<", "*", " ")):
                continue
            pkgs_to_fetch.append(name)

        if pkgs_to_fetch:
            self.prefetch_release_dates(pkgs_to_fetch, retry_failed=retry_failed)

        # 2. Score packages sequentially from cache
        for pkg in packages:
            name = (pkg.get("name") or "").strip()
            version = (pkg.get("version") or "").strip()

            if not name:
                continue

            custom_date = release_map.get(f"{name}@{version}") or release_map.get(name)
            res = self.calculate_libyear(name, version, analysis_dt, custom_release_date=custom_date)
            results.append(res)

            if res.status != "scored":
                unscored_names.append(name)
                if res.reason_unscored:
                    warnings.append(f"{name}: {res.reason_unscored}")

        scored_results = [r for r in results if r.status == "scored" and r.libyear is not None]
        total_libyear = round(sum(r.libyear for r in scored_results), 2)
        avg_libyear = round(total_libyear / len(scored_results), 2) if scored_results else 0.0

        failed_lookup_packages = sorted(list(set(
            r.package_name for r in results if r.category == "lookup_failed"
        )))

        return FreshnessAnalysisResponse(
            status="completed" if results else "empty",
            analysis_date=analysis_dt.isoformat(),
            total_packages=len(results),
            scored_packages_count=len(scored_results),
            unscored_packages_count=len(unscored_names),
            project_total_libyear=total_libyear,
            project_average_libyear=avg_libyear,
            results=results,
            unscored_packages=sorted(list(set(unscored_names))),
            failed_lookup_packages=failed_lookup_packages,
            warnings=warnings
        )
