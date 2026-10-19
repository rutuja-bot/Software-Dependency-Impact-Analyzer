# API Contract Specification

**Base URL:** `http://localhost:8000/api`

---

## 1. `GET /api/health`
Checks whether the backend server is operational.

### Response `200 OK`
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "project": "Software Dependency Impact Analyzer",
  "timestamp": "2026-10-12T17:15:00.000000"
}
```

---

## 2. `GET /api/info`
Retrieves system metadata, supported lockfiles, edge conventions, and feature roadmaps.

### Response `200 OK`
```json
{
  "project_name": "Software Dependency Impact Analyzer",
  "version": "0.1.0",
  "description": "Analyzes software dependencies as directed graphs...",
  "supported_ecosystems": ["Node.js (npm)"],
  "supported_lockfile_versions": [1, 2, 3],
  "edge_convention": "A -> B strictly means: 'Package A depends on Package B'",
  "implemented_features": [
    "package.json manifest parsing",
    "package-lock.json v1, v2, v3 lockfile parsing",
    "Directed Dependency Graph (NetworkX DiGraph)",
    "Direct and Transitive dependency classification",
    "Circular Dependency Detection (Simple Cycles / Tarjan SCC)",
    "Topological Sorting for DAG evaluation",
    "Downstream Reverse Dependency Impact Analysis (BFS Shortest Path)",
    "Interactive Cytoscape.js Graph Visualization payload formatting"
  ],
  "planned_features": [
    "In-memory 'What-If' dependency mutation simulation (add/update/remove)",
    "OSV REST API Vulnerability cross-referencing",
    "PostgreSQL persistence with SQLAlchemy & Alembic",
    "LibYear dependency freshness and lag scoring"
  ]
}
```

---

## 3. `POST /api/analyze`
Submits raw or parsed JSON manifests for full graph construction and topological analysis.

### Request Body
```json
{
  "package_json": {
    "name": "sample-app",
    "version": "1.0.0",
    "dependencies": {
      "express": "^4.18.2"
    }
  },
  "package_lock_json": {
    "name": "sample-app",
    "lockfileVersion": 3,
    "packages": {
      "": { "dependencies": { "express": "^4.18.2" } },
      "node_modules/express": {
        "version": "4.18.2",
        "dependencies": { "accepts": "~1.3.8" }
      },
      "node_modules/accepts": {
        "version": "1.3.8",
        "dependencies": {}
      }
    }
  }
}
```

### Response `200 OK`
```json
{
  "project_name": "sample-app",
  "project_version": "1.0.0",
  "stats": {
    "total_packages": 2,
    "direct_dependencies_count": 1,
    "transitive_dependencies_count": 1,
    "total_dependency_edges": 2,
    "has_cycles": false,
    "cycle_count": 0,
    "is_dag": true,
    "root_package": "sample-app"
  },
  "nodes": [
    {
      "name": "sample-app",
      "version": "1.0.0",
      "is_root": true,
      "dep_type": "direct",
      "depth": 0,
      "out_degree": 1,
      "in_degree": 0
    },
    {
      "name": "express",
      "version": "4.18.2",
      "is_root": false,
      "dep_type": "direct",
      "depth": 1,
      "out_degree": 1,
      "in_degree": 1
    },
    {
      "name": "accepts",
      "version": "1.3.8",
      "is_root": false,
      "dep_type": "transitive",
      "depth": 2,
      "out_degree": 0,
      "in_degree": 1
    }
  ],
  "edges": [
    {
      "source": "sample-app",
      "target": "express",
      "version_constraint": "^4.18.2",
      "relation": "depends_on"
    },
    {
      "source": "express",
      "target": "accepts",
      "version_constraint": "~1.3.8",
      "relation": "depends_on"
    }
  ],
  "cycles": [],
  "topological_order": ["sample-app", "express", "accepts"],
  "direct_dependencies": ["express"],
  "transitive_dependencies": ["accepts"]
}
```

---

## 4. `GET /api/impact?target_package=<name>`
Traverses the reverse graph to identify all downstream packages impacted if `target_package` changes.

### Response `200 OK`
```json
{
  "target_package": "accepts",
  "affected_packages": ["express", "sample-app"],
  "affected_count": 2,
  "reverse_dependency_paths": {
    "express": [["express", "accepts"]],
    "sample-app": [["sample-app", "express", "accepts"]]
  }
}
```

---

## 5. `POST /api/simulate`
Simulates adding, removing, or upgrading dependencies on an isolated, deep-copied graph without altering the baseline project.

### Request Body (`add` operation)
```json
{
  "operation": "add",
  "target_package": "redis",
  "source_package": "sample-app",
  "version": "^4.6.0",
  "dep_type": "direct"
}
```

### Request Body (`upgrade` operation)
```json
{
  "operation": "upgrade",
  "target_package": "express",
  "version": "5.0.0"
}
```

### Request Body (`remove` operation)
```json
{
  "operation": "remove",
  "target_package": "express",
  "source_package": "sample-app"
}
```

### Response `200 OK`
```json
{
  "operation": "add",
  "target_package": "redis",
  "source_package": "sample-app",
  "message": "Simulated adding dependency 'sample-app -> redis'.",
  "baseline_stats": {
    "total_packages": 2,
    "direct_dependencies_count": 1,
    "transitive_dependencies_count": 1,
    "total_dependency_edges": 2,
    "has_cycles": false,
    "cycle_count": 0,
    "is_dag": true,
    "root_package": "sample-app"
  },
  "simulated_stats": {
    "total_packages": 3,
    "direct_dependencies_count": 2,
    "transitive_dependencies_count": 1,
    "total_dependency_edges": 3,
    "has_cycles": false,
    "cycle_count": 0,
    "is_dag": true,
    "root_package": "sample-app"
  },
  "diff": {
    "added_nodes": ["redis"],
    "removed_nodes": [],
    "added_edges": [
      {
        "source": "sample-app",
        "target": "redis",
        "version_constraint": "^4.6.0",
        "relation": "depends_on"
      }
    ],
    "removed_edges": [],
    "orphaned_nodes": [],
    "version_changes": {}
  },
  "cycle_diff": {
    "introduced_cycles": [],
    "eliminated_cycles": [],
    "baseline_cycle_count": 0,
    "simulated_cycle_count": 0
  },
  "impact_diff": {
    "target_package": "redis",
    "baseline_affected_count": 0,
    "simulated_affected_count": 1,
    "newly_affected_packages": ["sample-app"],
    "no_longer_affected_packages": []
  },
  "simulated_analysis": {
    "project_name": "sample-app",
    "project_version": "1.0.0",
    "stats": { ... },
    "nodes": [ ... ],
    "edges": [ ... ],
    "cycles": [],
    "topological_order": ["sample-app", "express", "redis", "accepts"]
  },
  "warnings": []
}
```

---

## 5. `POST /api/security/scan`
Cross-references resolved dependencies in the baseline graph against Google's Open Source Vulnerabilities (OSV) REST API (`https://api.osv.dev/v1/query`).

### Request Body (Optional)
If omitted or empty, queries all resolved packages currently present in the active baseline graph.
```json
{
  "packages": [
    {
      "name": "lodash",
      "version": "4.17.15"
    }
  ]
}
```

### Response `200 OK`
```json
{
  "scanned_at": "2026-10-13T18:00:00.000000",
  "total_packages_queried": 1,
  "vulnerable_packages_count": 1,
  "clean_packages_count": 0,
  "unresolved_packages_count": 0,
  "packages": [
    {
      "package_name": "lodash",
      "version": "4.17.15",
      "status": "vulnerable",
      "vulnerability_count": 1,
      "vulnerabilities": [
        {
          "id": "GHSA-p6mc-m468-83gw",
          "summary": "Prototype Pollution in lodash",
          "details": "Lodash versions prior to 4.17.21 are vulnerable...",
          "severity": "CRITICAL",
          "fixed_versions": ["4.17.21"],
          "references": [
            {
              "type": "ADVISORY",
              "url": "https://github.com/advisories/GHSA-p6mc-m468-83gw"
            }
          ]
        }
      ]
    }
  ],
  "disclaimer": "Clean status reflects absence of published advisories in the OSV database for the specific concrete versions queried; it does not guarantee code is vulnerability-free."
}
```

---

## 6. `POST /api/freshness/analyze`
Computes LibYear technical lag metrics for packages in the baseline graph by querying registry publication timestamps.

`LibYear` is defined as:
$$\text{LibYear} = \max\left(0.0, \frac{\text{analysis\_timestamp} - \text{version\_release\_timestamp}}{365.25 \times 86400}\right)$$

### Request Body (Optional)
```json
{
  "analysis_date": "2026-10-13T18:00:00Z"
}
```

### Response `200 OK`
```json
{
  "analysis_date": "2026-10-13T18:00:00Z",
  "total_packages_evaluated": 2,
  "scored_packages_count": 2,
  "unscored_packages_count": 0,
  "project_total_libyears": 4.52,
  "project_average_libyear": 2.26,
  "packages": [
    {
      "package_name": "express",
      "installed_version": "4.18.2",
      "installed_release_date": "2022-10-08T00:00:00Z",
      "latest_version": "4.19.2",
      "latest_release_date": "2024-03-25T00:00:00Z",
      "libyear": 4.01,
      "status": "scored",
      "unscored_reason": null
    }
  ],
  "formula_explanation": "LibYear measures chronological age lag in years between version release and analysis date. Unscored packages are excluded from the project average denominator."
}
```

---

## 7. `GET /api/projects/status`
Checks PostgreSQL persistence connectivity, migration state, and repository summary counts.

### Response `200 OK`
```json
{
  "connected": true,
  "status": "connected",
  "message": "PostgreSQL database connected and operational.",
  "total_projects": 3,
  "total_analyses": 8,
  "total_simulations": 4
}
```

---

## 8. `POST /api/projects`
Registers a new software project / service repository in the persistent catalog.

### Request Body
```json
{
  "name": "sample-node-service",
  "ecosystem": "npm",
  "description": "Production API backend"
}
```

### Response `200 OK`
```json
{
  "id": "c1f7a0b3-1234-4a5b-bcde-9876543210ab",
  "name": "sample-node-service",
  "ecosystem": "npm",
  "description": "Production API backend",
  "created_at": "2026-10-14T00:00:00Z",
  "updated_at": "2026-10-14T00:00:00Z",
  "analysis_count": 0,
  "simulation_count": 0
}
```

---

## 9. `GET /api/projects`
Lists registered projects with pagination.

**Query Parameters:**
- `limit` (int, default 50)
- `offset` (int, default 0)

---

## 10. `GET /api/projects/{project_id}/analyses`
Lists historical analysis runs and high-level graph statistics for a specific project.

### Response `200 OK`
```json
[
  {
    "id": "e4d2a1b9-5678-4c3d-9f01-23456789abcd",
    "project_id": "c1f7a0b3-1234-4a5b-bcde-9876543210ab",
    "project_version": "1.2.0",
    "status": "completed",
    "total_packages": 15,
    "direct_dependencies_count": 3,
    "transitive_dependencies_count": 11,
    "total_dependency_edges": 18,
    "has_cycles": false,
    "cycle_count": 0,
    "is_dag": true,
    "created_at": "2026-10-14T00:05:00Z"
  }
]
```

---

## 11. `GET /api/analyses/{analysis_id}`
Retrieves complete analysis execution details and its reproducible graph snapshot.

---

## 12. `GET /api/analyses/{analysis_id}/snapshot`
Retrieves the immutable Cytoscape nodes and edges snapshot strictly adhering to the `A -> B` convention.

---

## 13. `GET /api/analyses/{analysis_id}/security`
Retrieves persisted OSV vulnerability records associated with the specified analysis run.

---

## 14. `GET /api/analyses/{analysis_id}/freshness`
Retrieves persisted package LibYear scores and project-level technical lag averages.

---

## 15. `GET /api/projects/{project_id}/simulations`
Lists What-If dependency change simulation runs performed against baseline analyses of the project.


