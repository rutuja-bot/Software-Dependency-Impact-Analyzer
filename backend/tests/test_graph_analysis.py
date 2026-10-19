import pytest
import networkx as nx

from app.parsers.nodejs import NodeJsManifestParser
from app.services.graph_service import DependencyGraphService

def test_parse_package_json_empty():
    raw = {"name": "empty-app", "version": "1.0.0"}
    manifest = NodeJsManifestParser.parse_package_json(raw)
    assert manifest.name == "empty-app"
    assert len(manifest.dependencies) == 0

def test_parse_package_json_multiple_direct():
    raw = {
        "name": "multi-app",
        "version": "1.0.0",
        "dependencies": {
            "express": "^4.18.2",
            "lodash": "^4.17.21"
        },
        "devDependencies": {
            "jest": "^29.5.0"
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw)
    assert len(manifest.dependencies) == 3
    assert manifest.dependencies["express"].is_direct is True
    assert manifest.dependencies["express"].is_dev is False
    assert manifest.dependencies["jest"].is_dev is True

def test_parse_package_lock_v2():
    raw_pkg = {
        "name": "lock-app",
        "dependencies": {"express": "^4.18.2"}
    }
    raw_lock = {
        "lockfileVersion": 2,
        "packages": {
            "": {"name": "lock-app"},
            "node_modules/express": {
                "version": "4.18.2",
                "dependencies": {
                    "accepts": "~1.3.8",
                    "cookie": "0.5.0"
                }
            },
            "node_modules/accepts": {
                "version": "1.3.8",
                "dependencies": {}
            },
            "node_modules/cookie": {
                "version": "0.5.0",
                "dependencies": {}
            }
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    assert manifest.has_lockfile is True
    assert manifest.lockfile_version == 2
    assert "accepts" in manifest.dependencies
    assert manifest.dependencies["express"].resolved_version == "4.18.2"
    assert "accepts" in manifest.dependencies["express"].dependencies

def test_parse_unsupported_lockfile_version():
    raw_pkg = {"name": "test-app"}
    raw_lock = {"lockfileVersion": 99}
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    with pytest.raises(ValueError) as excinfo:
        NodeJsManifestParser.parse_package_lock(raw_lock, manifest)
    assert "Unsupported package-lock.json lockfileVersion: 99" in str(excinfo.value)

def test_graph_construction_and_edge_direction():
    """
    Test edge convention: A -> B means A depends on B.
    Root -> express, express -> cookie.
    """
    raw_pkg = {"name": "root-app", "dependencies": {"express": "^4.18.0"}}
    raw_lock = {
        "lockfileVersion": 2,
        "packages": {
            "node_modules/express": {
                "version": "4.18.0",
                "dependencies": {"cookie": "0.5.0"}
            },
            "node_modules/cookie": {
                "version": "0.5.0",
                "dependencies": {}
            }
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)

    # Edge checks
    assert G.has_edge("root-app", "express"), "Root must have directed edge to express"
    assert G.has_edge("express", "cookie"), "Express must have directed edge to cookie"
    assert not G.has_edge("cookie", "express"), "Edge direction must NOT be inverted"

    analysis = service.analyze_graph(G, "root-app")
    assert analysis.stats.total_packages == 2
    assert analysis.stats.direct_dependencies_count == 1
    assert analysis.stats.transitive_dependencies_count == 1
    assert analysis.stats.is_dag is True
    assert analysis.topological_order is not None

def test_circular_dependency_detection():
    """
    A -> B -> C -> A
    """
    raw_pkg = {"name": "cyclic-app", "dependencies": {"pkgA": "1.0.0"}}
    raw_lock = {
        "lockfileVersion": 2,
        "packages": {
            "node_modules/pkgA": {"version": "1.0.0", "dependencies": {"pkgB": "1.0.0"}},
            "node_modules/pkgB": {"version": "1.0.0", "dependencies": {"pkgC": "1.0.0"}},
            "node_modules/pkgC": {"version": "1.0.0", "dependencies": {"pkgA": "1.0.0"}}
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)
    analysis = service.analyze_graph(G, "cyclic-app")

    assert analysis.stats.has_cycles is True
    assert analysis.stats.is_dag is False
    assert analysis.topological_order is None
    assert len(analysis.cycles) >= 1
    cycle = analysis.cycles[0].cycle_path
    assert "pkgA" in cycle and "pkgB" in cycle and "pkgC" in cycle

def test_downstream_impact_analysis():
    """
    Root -> ServiceA -> SharedLib
    Root -> ServiceB -> SharedLib
    Changing SharedLib affects: ServiceA, ServiceB, Root
    """
    raw_pkg = {
        "name": "my-mono",
        "dependencies": {"service-a": "1.0.0", "service-b": "1.0.0"}
    }
    raw_lock = {
        "lockfileVersion": 2,
        "packages": {
            "node_modules/service-a": {"version": "1.0.0", "dependencies": {"shared-lib": "1.0.0"}},
            "node_modules/service-b": {"version": "1.0.0", "dependencies": {"shared-lib": "1.0.0"}},
            "node_modules/shared-lib": {"version": "1.0.0", "dependencies": {}}
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)

    service = DependencyGraphService()
    G = service.build_graph(manifest)
    impact = service.find_affected_downstream_packages(G, "shared-lib")

    assert impact.target_package == "shared-lib"
    assert impact.affected_count == 3
    assert "service-a" in impact.affected_packages
    assert "service-b" in impact.affected_packages
    assert "my-mono" in impact.affected_packages


def test_dense_cycles_capped():
    """Verify that graphs with many cycles are capped at 50 and return fast."""
    service = DependencyGraphService()
    # Complete directed graph on 6 nodes has over 190 elementary cycles
    G_raw = nx.complete_graph(6, create_using=nx.DiGraph)
    G = nx.relabel_nodes(G_raw, {i: f"pkg_{i}" for i in range(6)})
    # Add root
    G.add_edge("root", "pkg_0")
    analysis = service.analyze_graph(G, "root")
    assert analysis.stats.has_cycles is True
    assert len(analysis.cycles) == 50

