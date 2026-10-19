from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class NormalizedDependency(BaseModel):
    name: str
    version_constraint: Optional[str] = None
    resolved_version: Optional[str] = None
    is_direct: bool = False
    is_dev: bool = False
    dependencies: Dict[str, str] = {}  # child dep_name -> version_constraint

class NormalizedProjectManifest(BaseModel):
    name: str
    version: Optional[str] = "1.0.0"
    dependencies: Dict[str, NormalizedDependency] = {}
    lockfile_version: Optional[int] = None
    has_lockfile: bool = False

class NodeJsManifestParser:
    """
    Parser for Node.js package.json and package-lock.json files.
    Supports package-lock.json lockfileVersion 1, 2, and 3.
    """

    @staticmethod
    def parse_package_json(raw: Dict[str, Any]) -> NormalizedProjectManifest:
        if not isinstance(raw, dict):
            raise ValueError("package.json content must be a valid JSON object.")
        
        project_name = raw.get("name", "unnamed-project")
        project_version = raw.get("version", "1.0.0")

        manifest = NormalizedProjectManifest(
            name=project_name,
            version=project_version,
            has_lockfile=False
        )

        direct_deps = raw.get("dependencies", {})
        if isinstance(direct_deps, dict):
            for dep_name, version_req in direct_deps.items():
                manifest.dependencies[dep_name] = NormalizedDependency(
                    name=dep_name,
                    version_constraint=str(version_req) if version_req is not None else None,
                    is_direct=True,
                    is_dev=False
                )

        dev_deps = raw.get("devDependencies", {})
        if isinstance(dev_deps, dict):
            for dep_name, version_req in dev_deps.items():
                if dep_name not in manifest.dependencies:
                    manifest.dependencies[dep_name] = NormalizedDependency(
                        name=dep_name,
                        version_constraint=str(version_req) if version_req is not None else None,
                        is_direct=True,
                        is_dev=True
                    )

        return manifest

    @staticmethod
    def parse_package_lock(raw_lock: Dict[str, Any], manifest: NormalizedProjectManifest) -> NormalizedProjectManifest:
        if not isinstance(raw_lock, dict):
            raise ValueError("package-lock.json content must be a valid JSON object.")

        lockfile_version = raw_lock.get("lockfileVersion")
        if lockfile_version not in [1, 2, 3]:
            raise ValueError(
                f"Unsupported package-lock.json lockfileVersion: {lockfile_version}. "
                "Supported versions are 1, 2, and 3."
            )

        manifest.lockfile_version = lockfile_version
        manifest.has_lockfile = True

        # Parse Lockfile v2 / v3 packages dictionary
        if "packages" in raw_lock and isinstance(raw_lock["packages"], dict):
            packages_dict = raw_lock["packages"]
            for pkg_path, pkg_info in packages_dict.items():
                if not isinstance(pkg_info, dict):
                    continue
                # Root package is represented as ""
                if pkg_path == "":
                    continue
                
                # Format is usually 'node_modules/pkg_name' or scoped 'node_modules/@scope/pkg_name'
                # or nested 'node_modules/A/node_modules/B'
                parts = pkg_path.split("node_modules/")
                pkg_name = parts[-1].strip("/")
                if not pkg_name:
                    continue

                resolved_ver = pkg_info.get("version")
                child_deps = pkg_info.get("dependencies", {})
                if not isinstance(child_deps, dict):
                    child_deps = {}

                # Check if it was already marked as direct in package.json
                is_direct = pkg_name in manifest.dependencies and manifest.dependencies[pkg_name].is_direct
                is_dev = bool(pkg_info.get("dev", False))

                existing = manifest.dependencies.get(pkg_name)
                version_constraint = existing.version_constraint if existing else None

                manifest.dependencies[pkg_name] = NormalizedDependency(
                    name=pkg_name,
                    version_constraint=version_constraint,
                    resolved_version=str(resolved_ver) if resolved_ver is not None else None,
                    is_direct=is_direct,
                    is_dev=is_dev,
                    dependencies={k: str(v) for k, v in child_deps.items() if isinstance(v, (str, int))}
                )

        # Parse Lockfile v1 dependencies dictionary (also present in v2 for backwards compatibility)
        elif "dependencies" in raw_lock and isinstance(raw_lock["dependencies"], dict):
            def _extract_v1_deps(dep_dict: Dict[str, Any]):
                for pkg_name, pkg_info in dep_dict.items():
                    if not isinstance(pkg_info, dict):
                        continue
                    resolved_ver = pkg_info.get("version")
                    child_requires = pkg_info.get("requires", {})
                    if not isinstance(child_requires, dict):
                        child_requires = {}

                    is_direct = pkg_name in manifest.dependencies and manifest.dependencies[pkg_name].is_direct
                    is_dev = bool(pkg_info.get("dev", False))

                    existing = manifest.dependencies.get(pkg_name)
                    version_constraint = existing.version_constraint if existing else None

                    manifest.dependencies[pkg_name] = NormalizedDependency(
                        name=pkg_name,
                        version_constraint=version_constraint,
                        resolved_version=str(resolved_ver) if resolved_ver is not None else None,
                        is_direct=is_direct,
                        is_dev=is_dev,
                        dependencies={k: str(v) for k, v in child_requires.items() if isinstance(v, (str, int))}
                    )

                    # Recursively handle nested dependencies if present
                    if "dependencies" in pkg_info and isinstance(pkg_info["dependencies"], dict):
                        _extract_v1_deps(pkg_info["dependencies"])

            _extract_v1_deps(raw_lock["dependencies"])

        return manifest
