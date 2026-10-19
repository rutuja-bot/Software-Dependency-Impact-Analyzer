# Architecture Design Document

**Project:** Software Dependency Impact Analyzer  
**Ecosystem:** Node.js (`package.json`, `package-lock.json`)  
**Core Graph Engine:** Directed Graph (`NetworkX DiGraph`)  

---

## 1. Component Architecture & Data Flow

```
+-------------------------------------------------------------------------------+
|                               React + Vite UI                                 |
|  - Cytoscape.js Directed Canvas                                               |
|  - Downstream Blast Radius Inspector                                          |
|  - Cycle & Topological Sequence Cards                                         |
+---------------------------------------+---------------------------------------+
                                        | (HTTP POST /api/analyze, GET /api/impact)
                                        v
+-------------------------------------------------------------------------------+
|                               FastAPI Service                                 |
|  - CORS & Centralized Exception Handler                                       |
|  - Pydantic Input/Output Schemas Validation                                   |
+---------------------------------------+---------------------------------------+
                                        |
                    +-------------------+-------------------+
                    |                                       |
                    v                                       v
+---------------------------------------+   +-----------------------------------+
|       NodeJsManifestParser            |   |     DependencyGraphService        |
|  - package.json Parser                |   |  - NetworkX DiGraph Construction  |
|  - package-lock.json v1/v2/v3 Parser  |   |  - Breadth-First Search (BFS)     |
|  - Manifest Normalization Engine      |   |  - Cycle Detection (Tarjan / DFS) |
+---------------------------------------+   |  - Topological Sort (Kahn's)      |
                                            |  - Reverse Downstream Traversal   |
                                            +-----------------------------------+
```

---

## 2. Graph Edge Convention

The entire system strictly adheres to a single standard edge convention:

$$\mathbf{A \rightarrow B \iff \text{Package A depends on Package B}}$$

- **Root Edge:** The inspected root project points to each of its direct dependencies (`Root -> DirectDep`).
- **Transitive Edge:** When package $P_1$ requires package $P_2$, an edge is directed from $P_1$ to $P_2$ ($P_1 \rightarrow P_2$).
- **In-Degree vs Out-Degree:**
  - $\text{Out-degree}(P)$: The number of packages that package $P$ directly depends on.
  - $\text{In-degree}(P)$: The number of parent packages that directly depend on $P$.
- **Downstream Blast Radius (Impact):**
  - When package $T$ is modified, updated, or removed, the affected dependents are the nodes that depend on $T$ (directly or transitively).
  - Computationally, this is achieved by traversing the **reverse graph** $G^R$ from $T$ using BFS:
    $$\text{Impact}(T) = \{ v \in V \mid v \text{ can reach } T \text{ in } G \} = \text{Descendants}(G^R, T)$$

---

## 3. Security Boundaries & File Validation

1. **Static Analysis Only:** The analyzer never runs arbitrary package lifecycle hooks (`preinstall`, `postinstall`), never executes uploaded code, and never invokes `npm install`.
2. **Payload Validation:** JSON payloads are parsed and validated strictly against Pydantic schemas. Malformed syntax, unexpected types, and unsupported lockfile versions are rejected immediately with descriptive `400 Bad Request` responses.
3. **Information Disclosure Prevention:** Production endpoints and global exception handlers sanitize error outputs, ensuring stack traces and host filesystem paths are never leaked to clients.
4. **Resilient Network Architecture:** External security lookups (such as the OSV REST API) are isolated behind strict timeouts. If external services fail or are offline, local graph construction, cycle detection, topological sorting, and impact analysis continue uninterrupted.

---

## 4. In-Memory "What-If" Simulation Architecture

The simulation engine (`DependencySimulationService`) evaluates prospective dependency modifications without file I/O or modifying the baseline graph:

1. **Non-Destructive Isolation:**
   - Every simulation clones the active baseline graph using deep memory copying (`copy.deepcopy(baseline_graph)`).
   - Baseline state is untouched regardless of whether the simulation succeeds or encounters validation errors.
2. **Operations Supported:**
   - **Add Dependency:** Introduces a new package node and a directed edge (`source -> target`). If target already exists, links are augmented without duplicate node creation.
   - **Remove Dependency:** Removes an edge or all incoming edges to a target package. Detects orphaned packages that become disconnected/unreachable from the root.
   - **Upgrade Dependency:** Mutates the package version and incoming version constraints on the simulated graph copy without claiming unverified runtime compatibility.
3. **Graph Diffing & Cycle Deltas:**
   - Evaluates node differences ($\Delta V = V' \setminus V$), edge differences ($\Delta E = E' \setminus E$), and compares cycle paths before and after to report newly formed or eliminated circular loops.

---

## 5. Security Intelligence Architecture (OSV REST API)

1. **Concrete Version Requirement:**
   - OSV queries require concrete, pinned versions (e.g. `1.2.3`). Loose semver ranges or wildcards (`^1.2.0`, `~2.0`, `*`) are categorized as `unresolved` with an explicit notice to prevent false negative assumptions.
2. **Deduplicated Query Batching & Resiliency:**
   - Unique `(package_name, version)` pairs are deduplicated using hash sets before dispatch.
   - Each HTTP request uses a bounded timeout (5.0s) and handles HTTP 429 rate limits, socket timeouts, and network connection errors gracefully by marking package records as `error` rather than terminating the whole analysis.
3. **Structured Advisory Parsing:**
   - Advisory records extract GHSA / CVE IDs, summary text, CVSS severity tiers, fixed version constraints from `affected[].ranges[].events[].fixed`, and external advisory references.

---

## 6. Dependency Freshness Architecture (LibYear Scoring)

1. **Chronological Metric Math:**
   $$\text{LibYear} = \max\left(0.0, \frac{\text{analysis\_date} - \text{version\_release\_date}}{365.25 \times 86400}\right)$$
2. **Project Aggregation & Denominator Hygiene:**
   - Project Total LibYears = $\sum_{p \in \text{Scored}} \text{LibYear}(p)$
   - Project Average LibYears = $\frac{\sum_{p \in \text{Scored}} \text{LibYear}(p)}{|\text{Scored}|}$
   - Packages without published release timestamps (unresolved/unscored) are strictly excluded from the average denominator to avoid skewing comparison metrics.
3. **Registry Time Caching:**
   - Publication release times fetched from the npm registry API (`https://registry.npmjs.org/<package>`) are cached in-memory using thread-safe hash dictionaries to eliminate redundant network roundtrips.

---

## 7. PostgreSQL Persistence & History Architecture (SQLAlchemy 2.0 & Alembic)

1. **Normalized Relational Schema:**
   - **`projects`**: Root entity tracking repository identities and ecosystems (`npm`).
   - **`analysis_runs`**: Records execution metadata, graph summary metrics, and links snapshots.
   - **`graph_snapshots`**: Immutable representation of Cytoscape nodes and directed edges adhering strictly to $A \rightarrow B$.
   - **`vulnerability_findings`**: Normalizes OSV security advisories, CVSS tiers, and fixed version ranges.
   - **`freshness_records`**: Captures individual package LibYear scores and project-level averages.
   - **`simulation_runs`**: Persists isolated What-If mutation deltas ($\Delta V, \Delta E$) linked to baseline analysis IDs without modifying baseline snapshots.
2. **ACID Transaction & Lifecycle Management:**
   - Managed via SQLAlchemy 2.0 scoped sessions using `get_db` generator dependencies.
   - Cascade deletes (`ondelete="CASCADE"`) prevent orphan records when deleting projects or analysis runs.
   - Connection pooling (`QueuePool`) with `pool_pre_ping=True` ensures robust reconnection over network boundaries.
3. **Graceful Fallback & Headless Operational Decoupling:**
   - If PostgreSQL is unconfigured or unreachable, the core analyzer, simulation engine, OSV client, and LibYear scorer continue uninterrupted in-memory.

