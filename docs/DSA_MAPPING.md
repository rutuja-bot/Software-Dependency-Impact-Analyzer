# Data Structures and Algorithms (DSA) Mapping

**Project:** Software Dependency Impact Analyzer  
**Academic Level:** B.Tech Computer Science & Engineering  

This document details the core Data Structures and Algorithms underpinning the analysis engine, their computational complexity, and their concrete implementation within the codebase.

---

## 1. Graph Data Structures

### 1.1 Directed Graph ($\mathbf{G = (V, E)}$)
- **Application:** Represents software packages as vertices ($V$) and dependency relationships as directed edges ($E$).
- **Representation:** Adjacency List (via `networkx.DiGraph`).
- **Edge Direction:** Strictly $\mathbf{A \rightarrow B \iff \text{Package A depends on Package B}}$.
- **Space Complexity:** $\mathcal{O}(|V| + |E|)$ where $|V|$ is the number of packages and $|E|$ is the total number of dependency links.

### 1.2 Reverse Graph ($\mathbf{G^R = (V, E^R)}$)
- **Application:** Evaluates change blast radius. While $G$ captures forward dependencies (what a package needs), the reverse graph $G^R$ (where edge $(u, v) \in E \implies (v, u) \in E^R$) allows traversing from an updated target package to all parent and consumer packages that depend on it.
- **Space Complexity:** $\mathcal{O}(|V| + |E|)$.

---

## 2. Core Graph Algorithms

### 2.1 Breadth-First Search (BFS) & Shortest Path Depths
- **Application:**
  1. Computes the minimum hop distance from the project root to each direct and transitive dependency.
  2. Identifies the shortest causal dependency path from an affected downstream package to the mutated package.
- **Data Structures Used:** First-In-First-Out Queue (`collections.deque`), Visited Hash Set (`set`).
- **Time Complexity:** $\mathcal{O}(|V| + |E|)$.
- **Space Complexity:** $\mathcal{O}(|V|)$.

### 2.2 Cycle Detection & Strongly Connected Components (SCC)
- **Application:** Identifies hazardous circular dependencies and peer-dependency loops in npm trees that cause build failures, infinite installation loops, or memory leaks.
- **Algorithm:** Tarjan's SCC Algorithm and Johnson's / DFS Simple Cycles Algorithm (`nx.simple_cycles`).
- **Time Complexity:**
  - Cycle existence test: $\mathcal{O}(|V| + |E|)$ via DFS cycle check.
  - Enumeration of simple cycles: $\mathcal{O}((|V| + |E|)(C + 1))$ where $C$ is the number of elementary cycles.
- **Space Complexity:** $\mathcal{O}(|V| + |E|)$.

### 2.3 Topological Sorting
- **Application:** Computes a valid linear evaluation and build order of dependencies (ensuring that every package is installed or compiled before any package that depends on it).
- **Algorithm:** Kahn's Algorithm (in-degree tracking via Queue) or DFS Post-Order Reversal.
- **Precondition:** Only defined on Directed Acyclic Graphs (DAGs). The system verifies acyclicity ($\text{is\_dag} = \text{True}$) before computing the order; if cycles exist, topological ordering is safely disabled and cycles are highlighted.
- **Time Complexity:** $\mathcal{O}(|V| + |E|)$.
- **Space Complexity:** $\mathcal{O}(|V|)$.

### 2.4 Reverse Reachability (Blast Radius Analysis)
- **Application:** Determines the exact set of downstream packages affected when a target package $T$ is upgraded, broken, or removed.
- **Algorithm:** Reverse BFS/DFS traversal initialized from node $T$ on $G^R$:
  $$\text{BlastRadius}(T) = \{ v \in V \mid v \leadsto T \text{ in } G \} = \text{Descendants}(G^R, T)$$
- **Time Complexity:** $\mathcal{O}(|V_{\text{sub}}| + |E_{\text{sub}}|)$ bounded by the component size.
- **Space Complexity:** $\mathcal{O}(|V|)$.

### 2.5 Graph Copying & Delta Diffing (What-If Simulation)
- **Application:** Evaluates prospective additions, removals, or upgrades without mutating the shared baseline dependency state.
- **Algorithm:** Deep cloning of adjacency lists followed by symmetric difference operations on vertex and edge sets:
  $$\Delta V_{\text{added}} = V' \setminus V, \quad \Delta V_{\text{removed}} = V \setminus V'$$
  $$\Delta E_{\text{added}} = E' \setminus E, \quad \Delta E_{\text{removed}} = E \setminus E'$$
- **Cycle Delta:** Compares elementary cycle sets:
  $$C_{\text{introduced}} = \text{Cycles}(G') \setminus \text{Cycles}(G), \quad C_{\text{eliminated}} = \text{Cycles}(G) \setminus \text{Cycles}(G')$$
- **Time Complexity:** $\mathcal{O}(|V| + |E|)$ for graph cloning and diff calculation; bounded cycle checking $\mathcal{O}((|V| + |E|)(C + 1))$.
- **Space Complexity:** $\mathcal{O}(|V| + |E|)$ auxiliary space for the simulated graph copy.

### 2.6 Deduplication Hashing & Hash Map Caching (OSV & LibYear)
- **Application:** Deduplicates external OSV security queries across multi-parent shared dependencies and memoizes registry package release metadata.
- **Data Structures:** Hash Map (`dict`), Hash Set (`set`).
- **Algorithm:**
  - Distinct key formulation $k = (package, version)$ with lookup $\mathcal{O}(1)$ average time.
  - Thread-safe in-memory cache $\mathcal{M}: \text{package} \to \{\text{version} \to \text{timestamp}\}$.
- **Time Complexity:** $\mathcal{O}(U)$ where $U \le |V|$ is the number of unique concrete package versions.
- **Space Complexity:** $\mathcal{O}(U)$ auxiliary memory for cache mappings.

### 2.7 Metric Arithmetic & Statistical Aggregations (LibYear)
- **Application:** Measures chronological release date technical lag across all scored packages.
- **Algorithm:** Normalized epoch delta computation:
  $$\text{LibYear}(p) = \max\left(0.0, \frac{t_{\text{analysis}} - t_{\text{release}}(p)}{365.25 \times 86400}\right)$$
  Excludes unscored packages from the average denominator:
  $$\mu_{\text{LibYear}} = \frac{\sum_{p \in S} \text{LibYear}(p)}{|S|}, \quad S = \{ p \in V \mid t_{\text{release}}(p) \neq \text{None} \}$$
- **Time Complexity:** $\mathcal{O}(|V|)$.
- **Space Complexity:** $\mathcal{O}(|V|)$.

### 2.8 Relational B-Tree Indexing & Adjacency Serialization (Persistence)
- **Application:** Indexing foreign keys, project names, and vulnerability IDs for sub-millisecond retrieval; serializing directed graph adjacency lists into immutable snapshot payloads.
- **Data Structures:** Relational B-Tree indices (`Index`), JSON/JSONB documents.
- **Complexities:**
  - B-Tree point query lookup: $\mathcal{O}(\log N)$ disk/index operations.
  - Snapshot graph serialization/deserialization: $\mathcal{O}(|V| + |E|)$ memory-to-JSON serialization.

---

## 3. Practical Complexity Summary Table

| DSA Topic | Function / Method | Primary Purpose | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- | :--- |
| **Directed Graph** | `DependencyGraphService.build_graph` | Model project manifests & lockfile trees | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\| + \|E\|)$ |
| **BFS Traversal** | `_calculate_depths` | Calculate root-to-node hop distances | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\|)$ |
| **DFS / Tarjan's** | `analyze_graph (simple_cycles)` | Detect and extract circular loops | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\|)$ |
| **Topological Sort** | `analyze_graph (topological_sort)` | Valid build/install sequencing for DAGs | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\|)$ |
| **Reverse BFS** | `find_affected_downstream_packages` | Downstream blast radius & causal paths | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\|)$ |
| **Graph Diffing** | `DependencySimulationService.simulate` | Compute isolated structural changes ($\Delta V, \Delta E$) | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\| + \|E\|)$ |
| **Hash Sets / Maps** | Visited trackers, node attributes | $\mathcal{O}(1)$ average-time node lookups | $\mathcal{O}(1)$ avg | $\mathcal{O}(\|V\|)$ |
| **Memoization / Hash Cache** | `FreshnessService._cache`, `OSVService` | Deduplicate queries and memoize registry metadata | $\mathcal{O}(U)$ where $U \le \|V\|$ | $\mathcal{O}(U)$ |
| **Metric Aggregation** | `FreshnessService.analyze_freshness` | Compute project total and average LibYear lag | $\mathcal{O}(\|V\|)$ | $\mathcal{O}(\|V\|)$ |
| **B-Tree Indices** | Relational lookup (`projects`, `analyses`) | Indexed foreign key and timestamp traversal | $\mathcal{O}(\log N)$ | $\mathcal{O}(N)$ |
| **Graph Serialization** | `GraphSnapshot` (JSON) | Persist and reconstruct immutable snapshots | $\mathcal{O}(\|V\| + \|E\|)$ | $\mathcal{O}(\|V\| + \|E\|)$ |

