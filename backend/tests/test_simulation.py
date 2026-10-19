import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.simulation import SimulationOperationType, SimulationRequest
from app.services.graph_service import DependencyGraphService
from app.services.simulation_service import DependencySimulationService
from app.parsers.nodejs import NodeJsManifestParser

client = TestClient(app)

@pytest.fixture
def baseline_fixture():
    raw_pkg = {
        "name": "sim-root",
        "version": "1.0.0",
        "dependencies": {
            "pkg-a": "1.0.0",
            "pkg-b": "1.0.0"
        }
    }
    raw_lock = {
        "lockfileVersion": 3,
        "packages": {
            "": {"dependencies": {"pkg-a": "1.0.0", "pkg-b": "1.0.0"}},
            "node_modules/pkg-a": {
                "version": "1.0.0",
                "dependencies": {"pkg-c": "1.0.0"}
            },
            "node_modules/pkg-b": {
                "version": "1.0.0",
                "dependencies": {}
            },
            "node_modules/pkg-c": {
                "version": "1.0.0",
                "dependencies": {}
            }
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)
    graph_service = DependencyGraphService()
    G = graph_service.build_graph(manifest)
    return G, "sim-root"

def test_simulate_add_valid_dependency(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()

    # Pre-condition: check node count and edge count
    orig_nodes = set(G.nodes())
    orig_edges = set(G.edges())

    req = SimulationRequest(
        operation=SimulationOperationType.ADD,
        target_package="pkg-new",
        version="2.1.0"
    )
    res = service.simulate(G, root, req)

    assert res.operation == SimulationOperationType.ADD
    assert "pkg-new" in res.diff.added_nodes
    assert len(res.diff.added_edges) == 1
    assert res.diff.added_edges[0].source == root
    assert res.diff.added_edges[0].target == "pkg-new"
    assert res.simulated_stats.total_packages == len(orig_nodes)  # orig_nodes included root

    # Isolation check: baseline must remain unchanged
    assert set(G.nodes()) == orig_nodes
    assert set(G.edges()) == orig_edges
    assert not G.has_node("pkg-new")

def test_simulate_add_invalid_empty_package(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.ADD,
        target_package="   "
    )
    with pytest.raises(ValueError) as excinfo:
        service.simulate(G, root, req)
    assert "Target package name cannot be empty" in str(excinfo.value)

def test_simulate_remove_dependency_edge_and_orphaned_nodes(baseline_fixture):
    """
    In baseline: root -> pkg-a -> pkg-c
    Removing edge root -> pkg-a leaves pkg-a and pkg-c orphaned (unreachable from root).
    """
    G, root = baseline_fixture
    service = DependencySimulationService()

    orig_nodes = set(G.nodes())
    orig_edges = set(G.edges())

    req = SimulationRequest(
        operation=SimulationOperationType.REMOVE,
        target_package="pkg-a"
    )
    res = service.simulate(G, root, req)

    assert res.operation == SimulationOperationType.REMOVE
    assert "pkg-a" in res.diff.removed_nodes
    assert any(e.source == root and e.target == "pkg-a" for e in res.diff.removed_edges)
    assert "pkg-c" in res.diff.orphaned_nodes

    # Isolation check: baseline must remain unchanged
    assert set(G.nodes()) == orig_nodes
    assert set(G.edges()) == orig_edges
    assert G.has_node("pkg-a")

def test_simulate_remove_nonexistent_package(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.REMOVE,
        target_package="nonexistent-pkg"
    )
    with pytest.raises(ValueError) as excinfo:
        service.simulate(G, root, req)
    assert "does not exist in the graph" in str(excinfo.value)

def test_simulate_remove_root_package_rejected(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.REMOVE,
        target_package=root
    )
    with pytest.raises(ValueError) as excinfo:
        service.simulate(G, root, req)
    assert "Cannot remove the project root package" in str(excinfo.value)

def test_simulate_upgrade_package_version(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()

    orig_nodes = set(G.nodes())
    orig_edges = set(G.edges())
    orig_version = G.nodes["pkg-a"]["version"]

    req = SimulationRequest(
        operation=SimulationOperationType.UPGRADE,
        target_package="pkg-a",
        version="3.0.0"
    )
    res = service.simulate(G, root, req)

    assert res.operation == SimulationOperationType.UPGRADE
    assert res.diff.version_changes["pkg-a"]["original_version"] == orig_version
    assert res.diff.version_changes["pkg-a"]["simulated_version"] == "3.0.0"

    # Isolation check: baseline version must be unchanged
    assert G.nodes["pkg-a"]["version"] == orig_version
    assert set(G.nodes()) == orig_nodes
    assert set(G.edges()) == orig_edges

def test_simulate_upgrade_missing_version_rejected(baseline_fixture):
    G, root = baseline_fixture
    service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.UPGRADE,
        target_package="pkg-a",
        version=""
    )
    with pytest.raises(ValueError) as excinfo:
        service.simulate(G, root, req)
    assert "Proposed version must be specified" in str(excinfo.value)

def test_detect_newly_introduced_cycle(baseline_fixture):
    """
    Baseline: root -> pkg-a -> pkg-c
    Adding dependency pkg-c -> pkg-a creates cycle pkg-a -> pkg-c -> pkg-a
    """
    G, root = baseline_fixture
    service = DependencySimulationService()

    req = SimulationRequest(
        operation=SimulationOperationType.ADD,
        source_package="pkg-c",
        target_package="pkg-a"
    )
    res = service.simulate(G, root, req)

    assert res.simulated_stats.has_cycles is True
    assert res.cycle_diff.simulated_cycle_count > res.cycle_diff.baseline_cycle_count
    assert len(res.cycle_diff.introduced_cycles) >= 1
    new_loop = res.cycle_diff.introduced_cycles[0].cycle_path
    assert "pkg-a" in new_loop and "pkg-c" in new_loop

def test_detect_cycle_eliminated():
    """
    Graph with cycle: X -> Y -> X
    Removing Y -> X eliminates the cycle.
    """
    raw_pkg = {"name": "cycle-root", "dependencies": {"X": "1.0"}}
    raw_lock = {
        "lockfileVersion": 3,
        "packages": {
            "": {"dependencies": {"X": "1.0"}},
            "node_modules/X": {"version": "1.0", "dependencies": {"Y": "1.0"}},
            "node_modules/Y": {"version": "1.0", "dependencies": {"X": "1.0"}}
        }
    }
    manifest = NodeJsManifestParser.parse_package_json(raw_pkg)
    manifest = NodeJsManifestParser.parse_package_lock(raw_lock, manifest)
    graph_service = DependencyGraphService()
    G = graph_service.build_graph(manifest)

    service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.REMOVE,
        source_package="Y",
        target_package="X"
    )
    res = service.simulate(G, "cycle-root", req)

    assert res.baseline_stats.has_cycles is True
    assert res.simulated_stats.has_cycles is False
    assert len(res.cycle_diff.eliminated_cycles) >= 1
    assert len(res.cycle_diff.introduced_cycles) == 0

def test_api_simulate_end_to_end_and_isolation():
    """
    Test through FastAPI TestClient that /api/simulate returns 200,
    maintains baseline, and rejects subsequent invalid requests properly.
    """
    # Initialize active graph
    payload = {
        "package_json": {"name": "api-demo", "dependencies": {"dep1": "1.0.0"}},
        "package_lock_json": {
            "lockfileVersion": 3,
            "packages": {
                "": {"dependencies": {"dep1": "1.0.0"}},
                "node_modules/dep1": {"version": "1.0.0", "dependencies": {}}
            }
        }
    }
    res_init = client.post("/api/analyze", json=payload)
    assert res_init.status_code == 200

    # 1. Simulate ADD
    sim_add = client.post("/api/simulate", json={
        "operation": "add",
        "target_package": "new-plugin",
        "version": "^1.5.0"
    })
    assert sim_add.status_code == 200
    data_add = sim_add.json()
    assert data_add["diff"]["added_nodes"] == ["new-plugin"]

    # 2. Check baseline analysis via /api/impact - new-plugin should NOT be in baseline
    impact_check = client.get("/api/impact", params={"target_package": "new-plugin"})
    assert impact_check.status_code == 200
    assert impact_check.json()["affected_count"] == 0  # Not in baseline graph

    # 3. Simulate UPGRADE
    sim_up = client.post("/api/simulate", json={
        "operation": "upgrade",
        "target_package": "dep1",
        "version": "2.0.0"
    })
    assert sim_up.status_code == 200
    data_up = sim_up.json()
    assert data_up["diff"]["version_changes"]["dep1"]["simulated_version"] == "2.0.0"

    # 4. Simulate REMOVE
    sim_del = client.post("/api/simulate", json={
        "operation": "remove",
        "target_package": "dep1"
    })
    assert sim_del.status_code == 200
    data_del = sim_del.json()
    assert "dep1" in data_del["diff"]["removed_nodes"]

    # 5. Consecutive simulations must not contaminate each other:
    # A subsequent simulation should still see baseline 'dep1' present!
    sim_up2 = client.post("/api/simulate", json={
        "operation": "upgrade",
        "target_package": "dep1",
        "version": "2.1.0"
    })
    assert sim_up2.status_code == 200
    assert sim_up2.json()["diff"]["version_changes"]["dep1"]["original_version"] == "1.0.0"
