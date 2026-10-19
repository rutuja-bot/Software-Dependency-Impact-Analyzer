import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.parsers.nodejs import NodeJsManifestParser
from app.services.graph_service import DependencyGraphService

client = TestClient(app)

def test_api_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data

def test_api_info_endpoint():
    res = client.get("/api/info")
    assert res.status_code == 200
    data = res.json()
    assert data["project_name"] == "Software Dependency Impact Analyzer"
    assert "Node.js (npm)" in data["supported_ecosystems"]
    assert 1 in data["supported_lockfile_versions"]
    assert 2 in data["supported_lockfile_versions"]
    assert 3 in data["supported_lockfile_versions"]
    assert "A -> B strictly means: 'Package A depends on Package B'" in data["edge_convention"]

def test_api_analyze_and_impact_flow():
    payload = {
        "package_json": {
            "name": "flow-demo",
            "version": "2.0.0",
            "dependencies": {
                "alpha": "^1.0.0"
            }
        },
        "package_lock_json": {
            "name": "flow-demo",
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"alpha": "^1.0.0"}},
                "node_modules/alpha": {
                    "version": "1.0.0",
                    "dependencies": {"beta": "^2.0.0"}
                },
                "node_modules/beta": {
                    "version": "2.0.0",
                    "dependencies": {"gamma": "^3.0.0"}
                },
                "node_modules/gamma": {
                    "version": "3.0.0",
                    "dependencies": {}
                }
            }
        }
    }
    # 1. Post to analyze
    res = client.post("/api/analyze", json=payload)
    assert res.status_code == 200
    analysis = res.json()
    assert analysis["project_name"] == "flow-demo"
    assert analysis["stats"]["total_packages"] == 3
    assert analysis["stats"]["direct_dependencies_count"] == 1
    assert analysis["stats"]["transitive_dependencies_count"] == 2
    assert analysis["stats"]["is_dag"] is True
    assert analysis["topological_order"] is not None

    # 2. Get impact for deepest transitive package 'gamma'
    impact_res = client.get("/api/impact", params={"target_package": "gamma"})
    assert impact_res.status_code == 200
    impact = impact_res.json()
    assert impact["target_package"] == "gamma"
    assert impact["affected_count"] == 3
    assert set(impact["affected_packages"]) == {"beta", "alpha", "flow-demo"}
    # Check shortest path
    assert impact["reverse_dependency_paths"]["flow-demo"] == [["flow-demo", "alpha", "beta", "gamma"]]

def test_api_impact_without_analyzed_project():
    from app.api.routes.analysis import _ACTIVE_GRAPH_CACHE
    _ACTIVE_GRAPH_CACHE.clear()
    res = client.get("/api/impact", params={"target_package": "some-pkg"})
    assert res.status_code == 404
    assert "No active project graph analyzed yet" in res.json()["detail"]

def test_api_invalid_package_json():
    # Sending invalid data type for package_json
    res = client.post("/api/analyze", json={"package_json": "not-a-dict"})
    assert res.status_code == 422 # Pydantic validation error

def test_api_unsupported_lockfile():
    payload = {
        "package_json": {"name": "app"},
        "package_lock_json": {"lockfileVersion": 999}
    }
    res = client.post("/api/analyze", json=payload)
    assert res.status_code == 400
    assert "Unsupported package-lock.json lockfileVersion: 999" in res.json()["detail"]

def test_lockfile_v1_nested_transitive_parsing():
    raw_pkg = {"name": "v1-app", "dependencies": {"web": "1.0.0"}}
    raw_lock = {
        "lockfileVersion": 1,
        "dependencies": {
            "web": {
                "version": "1.0.0",
                "requires": {"sub-lib": "1.0.0"},
                "dependencies": {
                    "sub-lib": {
                        "version": "1.0.0",
                        "requires": {"nested-deep": "2.0.0"},
                        "dependencies": {
                            "nested-deep": {
                                "version": "2.0.0",
                                "requires": {}
                            }
                        }
                    }
                }
            }
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)
    analysis = service.analyze_graph(G, "v1-app")

    assert analysis.stats.total_packages == 3
    assert "web" in analysis.direct_dependencies
    assert "sub-lib" in analysis.transitive_dependencies
    assert "nested-deep" in analysis.transitive_dependencies

def test_multi_level_reverse_impact_and_diamond_graph():
    """
    Diamond graph:
         Root
        /    \
       A      B
        \    /
          C
    Mutating C impacts: A, B, Root (3 packages)
    """
    raw_pkg = {"name": "diamond-root", "dependencies": {"A": "1.0", "B": "1.0"}}
    raw_lock = {
        "lockfileVersion": 3,
        "packages": {
            "": {"dependencies": {"A": "1.0", "B": "1.0"}},
            "node_modules/A": {"version": "1.0", "dependencies": {"C": "1.0"}},
            "node_modules/B": {"version": "1.0", "dependencies": {"C": "1.0"}},
            "node_modules/C": {"version": "1.0", "dependencies": {}}
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)
    impact = service.find_affected_downstream_packages(G, "C")

    assert impact.target_package == "C"
    assert impact.affected_count == 3
    assert set(impact.affected_packages) == {"A", "B", "diamond-root"}

def test_disconnected_subgraph_handling():
    """
    Project with a disconnected isolated package declared in lockfile
    """
    raw_pkg = {"name": "part-app", "dependencies": {"active": "1.0"}}
    raw_lock = {
        "lockfileVersion": 3,
        "packages": {
            "": {"dependencies": {"active": "1.0"}},
            "node_modules/active": {"version": "1.0", "dependencies": {}},
            "node_modules/orphan": {"version": "0.1", "dependencies": {}}
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)
    analysis = service.analyze_graph(G, "part-app")

    assert analysis.stats.total_packages == 2
    orphan_node = next(n for n in analysis.nodes if n.name == "orphan")
    assert orphan_node.depth is None  # Unreachable from root

