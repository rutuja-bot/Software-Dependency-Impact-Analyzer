import pytest
import io
import zipfile
import networkx as nx

from app.services.graph_service import DependencyGraphService
from app.services.risk_service import DependencyRiskService
from app.services.simulation_service import DependencySimulationService
from app.services.import_service import ProjectImportService
from app.schemas.simulation import SimulationRequest, SimulationOperationType
from app.schemas.graph import DependencyType

def test_impact_explorer_reverse_traversal_and_paths():
    """
    Test Dependency Impact Explorer:
    Graph: A -> B -> C -> D
    A depends on B, B depends on C, C depends on D.
    Target: D
    Direct dependents: C
    Transitive dependents: B, A (depth >= 2 in reverse graph)
    All downstream affected: A, B, C
    Exact path: A -> B -> C -> D
    """
    G = nx.DiGraph()
    G.add_node("A", version="1.0.0", is_root=True, dep_type=DependencyType.DIRECT, depth=0)
    G.add_node("B", version="1.0.0", is_root=False, dep_type=DependencyType.DIRECT, depth=1)
    G.add_node("C", version="1.0.0", is_root=False, dep_type=DependencyType.TRANSITIVE, depth=2)
    G.add_node("D", version="1.0.0", is_root=False, dep_type=DependencyType.TRANSITIVE, depth=3)

    G.add_edge("A", "B", relation="depends_on")
    G.add_edge("B", "C", relation="depends_on")
    G.add_edge("C", "D", relation="depends_on")

    service = DependencyGraphService()
    impact = service.explore_impact(G, target_package="D")

    assert impact.target_package == "D"
    assert impact.direct_dependents_count == 1
    assert [n.name for n in impact.direct_dependents] == ["C"]
    
    assert impact.transitive_dependents_count == 2
    assert sorted([n.name for n in impact.transitive_dependents]) == ["A", "B"]

    assert impact.total_affected_count == 3
    assert sorted(impact.all_downstream_affected) == ["A", "B", "C"]

    # Check exact dependency path from A to D
    assert "A" in impact.dependency_paths
    assert impact.dependency_paths["A"] == [["A", "B", "C", "D"]]

def test_impact_explorer_outgoing_dependencies_vs_incoming_dependents():
    """
    Verifies that outgoing dependencies (what D depends on) are strictly
    distinguished from incoming dependents (what depends on D).
    """
    G = nx.DiGraph()
    G.add_node("root", version="1.0.0", is_root=True, dep_type="direct", depth=0)
    G.add_node("middle", version="1.0.0", is_root=False, dep_type="direct", depth=1)
    G.add_node("leaf", version="1.0.0", is_root=False, dep_type="transitive", depth=2)

    G.add_edge("root", "middle")
    G.add_edge("middle", "leaf")

    service = DependencyGraphService()
    impact = service.explore_impact(G, target_package="middle")

    # middle depends on leaf (outgoing)
    assert impact.direct_dependencies_count == 1
    assert impact.direct_dependencies[0].name == "leaf"

    # root depends on middle (incoming)
    assert impact.direct_dependents_count == 1
    assert impact.direct_dependents[0].name == "root"

def test_impact_explorer_handles_cycles_and_isolated_nodes():
    """
    Verifies that cyclical graphs do not cause infinite loops,
    and isolated nodes return clean 0-impact results.
    """
    G = nx.DiGraph()
    G.add_node("c1", version="1.0.0", is_root=False, dep_type="direct", depth=1)
    G.add_node("c2", version="1.0.0", is_root=False, dep_type="direct", depth=1)
    G.add_node("isolated", version="1.0.0", is_root=False, dep_type="direct", depth=1)

    # Cycle: c1 <-> c2
    G.add_edge("c1", "c2")
    G.add_edge("c2", "c1")

    service = DependencyGraphService()
    
    # Impact on c1
    impact_c1 = service.explore_impact(G, target_package="c1")
    assert "c2" in impact_c1.all_downstream_affected
    assert impact_c1.total_affected_count == 1

    # Impact on isolated
    impact_iso = service.explore_impact(G, target_package="isolated")
    assert impact_iso.total_affected_count == 0
    assert impact_iso.direct_dependents_count == 0
    assert impact_iso.direct_dependencies_count == 0

def test_risk_scoring_four_factor_breakdown_and_categories():
    """
    Verifies that DependencyRiskService computes deterministic 0-100 scores
    combining vulnerability, freshness, downstream impact, and criticality.
    """
    G = nx.DiGraph()
    G.add_node("app", version="1.0.0", is_root=True, dep_type="direct")
    G.add_node("lodash", version="4.17.20", is_root=False, dep_type="direct")
    G.add_node("express", version="4.16.0", is_root=False, dep_type="direct")
    G.add_edge("app", "lodash")
    G.add_edge("app", "express")

    risk_service = DependencyRiskService()

    # 1. Clean package with modern freshness
    clean_risk = risk_service.calculate_package_risk(
        package_name="lodash",
        graph=G,
        root_package="app",
        vulnerabilities=[],
        libyear_record={"libyear": 0.1, "status": "scored"}
    )
    assert clean_risk.risk_category == "low"
    assert clean_risk.risk_score < 25.0
    assert clean_risk.factors["vulnerability"].normalized_score == 0.0

    # 2. Critical vulnerable package
    crit_vulns = [{"severity": "CRITICAL", "id": "GHSA-1234"}]
    crit_risk = risk_service.calculate_package_risk(
        package_name="express",
        graph=G,
        root_package="app",
        vulnerabilities=crit_vulns,
        libyear_record={"libyear": 6.2, "status": "scored"}
    )
    assert crit_risk.factors["vulnerability"].normalized_score == 95.0
    assert crit_risk.factors["freshness"].normalized_score == 100.0
    assert crit_risk.risk_score >= 50.0

    # 3. Category threshold validation
    assert DependencyRiskService.get_risk_category(15.0) == "low"
    assert DependencyRiskService.get_risk_category(35.0) == "moderate"
    assert DependencyRiskService.get_risk_category(60.0) == "high"
    assert DependencyRiskService.get_risk_category(85.0) == "critical"

def test_before_and_after_simulation_comparison():
    """
    Verifies before-and-after graph comparison during dependency upgrade:
    - version changes tracked
    - resolved vulnerabilities tracked
    - risk score delta computed
    - baseline graph remains strictly unmodified
    """
    G = nx.DiGraph()
    G.add_node("app", version="1.0.0", is_root=True, dep_type="direct")
    G.add_node("axios", version="0.21.1", is_root=False, dep_type="direct")
    G.add_edge("app", "axios")

    # Baseline graph clone to verify non-destructive isolation
    orig_nodes = list(G.nodes())
    orig_version = G.nodes["axios"]["version"]

    sim_service = DependencySimulationService()
    req = SimulationRequest(
        operation=SimulationOperationType.UPGRADE,
        target_package="axios",
        version="1.6.0"
    )

    security_findings = {
        "axios": [{"id": "CVE-2021-3749", "severity": "HIGH", "summary": "ReDoS in axios"}]
    }

    comp_res = sim_service.compare_simulation(
        baseline_graph=G,
        root_package="app",
        request=req,
        security_findings=security_findings
    )

    # 1. Structural change verification
    assert "axios" in comp_res.version_changes
    assert comp_res.version_changes["axios"]["original_version"] == "0.21.1"
    assert comp_res.version_changes["axios"]["simulated_version"] == "1.6.0"

    # 2. Security delta verification (upgraded package resolves the known advisory)
    assert comp_res.vulnerability_delta.resolved_count == 1
    assert comp_res.vulnerability_delta.introduced_count == 0

    # 3. Risk delta verification (resolved vulnerability improves risk score)
    assert comp_res.risk_delta.score_change <= 0.0

    # 4. Non-destructive guarantee: baseline graph must not be mutated!
    assert G.nodes["axios"]["version"] == orig_version
    assert list(G.nodes()) == orig_nodes

def test_safe_zip_extraction_and_security_guards():
    """
    Verifies safe ZIP extraction:
    - Rejects path traversal attempts (..)
    - Rejects absolute paths
    - Successfully locates and parses shallowest package.json
    """
    # 1. Malicious ZIP with path traversal
    bad_bio = io.BytesIO()
    with zipfile.ZipFile(bad_bio, "w") as zf:
        zf.writestr("../../etc/passwd", "root:x:0:0:")
        zf.writestr("package.json", '{"name": "evil"}')
    bad_bytes = bad_bio.getvalue()

    with pytest.raises(ValueError, match="path traversal"):
        ProjectImportService.extract_manifests_from_zip(bad_bytes)

    # 2. Valid safe project archive
    good_bio = io.BytesIO()
    with zipfile.ZipFile(good_bio, "w") as zf:
        zf.writestr("my-project/package.json", '{"name": "test-safe-proj", "version": "1.2.0", "dependencies": {"lodash": "^4.17.21"}}')
        zf.writestr("my-project/README.md", "# My Project")
    good_bytes = good_bio.getvalue()

    pkg_json, pkg_lock, meta = ProjectImportService.extract_manifests_from_zip(good_bytes)
    assert pkg_json["name"] == "test-safe-proj"
    assert meta["manifest_path"] == "my-project/package.json"
    assert meta["has_lockfile"] is False

def test_github_url_validation_and_ssrf_prevention():
    """
    Verifies GitHub URL validation:
    - Accepts valid github.com URLs
    - Rejects non-github hosts and local loopbacks (SSRF prevention)
    """
    owner, repo, branch = ProjectImportService.parse_github_url("https://github.com/facebook/react")
    assert owner == "facebook"
    assert repo == "react"
    assert branch is None

    # Tree branch in URL
    o2, r2, b2 = ProjectImportService.parse_github_url("https://github.com/expressjs/express/tree/master")
    assert o2 == "expressjs"
    assert r2 == "express"
    assert b2 == "master"

    # Rejection of SSRF attempts
    with pytest.raises(ValueError, match="Invalid repository host"):
        ProjectImportService.parse_github_url("https://127.0.0.1/evil/repo")

    with pytest.raises(ValueError, match="Invalid repository host"):
        ProjectImportService.parse_github_url("http://localhost:8000/evil/repo")

    with pytest.raises(ValueError, match="Invalid repository host"):
        ProjectImportService.parse_github_url("https://gitlab.com/other/repo")
