# Software Dependency Impact Analyzer

A modern, web-based graph analysis application that models software dependencies as a directed graph to help developers evaluate change blast radius, circular dependencies, topological build ordering, and downstream impact.

Developed as a B.Tech Computer Science and Engineering project centered on core Data Structures and Algorithms (DSA).

---

## 1. Project Overview & Edge Convention

The core analysis engine models dependency relationships using directed graphs in **NetworkX**.

### Edge Direction Convention
$$\mathbf{A \rightarrow B \iff \text{Package A depends on Package B}}$$

- **Forward Traversal:** Follows edges from parent to children to find all direct and transitive requirements.
- **Reverse Traversal:** Inverts edge directions to compute downstream dependents (blast radius) when a dependency is updated or dropped.

---

## 2. Features Implemented

### Phase 1 — Graph Foundation & Parsing
- [x] **Manifest & Lockfile Parsing:** Support for Node.js `package.json` and `package-lock.json` (versions 1, 2, and 3).
- [x] **Directed Dependency Graph:** In-memory graph construction using NetworkX DiGraph with explicit edge directions.
- [x] **Direct vs. Transitive Classification:** Automatic BFS hop distance calculation from root to distinguish direct dependencies (depth 1) from deep transitive dependencies (depth $\ge 2$).
- [x] **Circular Dependency Detection:** Cycle detection using DFS/Tarjan algorithms to flag recursive loops and peer-dependency cycles.
- [x] **Topological Sorting:** Kahn's algorithm evaluation to generate valid installation and build sequences for DAGs.
- [x] **Downstream Impact Analysis (Blast Radius):** Reverse BFS traversal from any selected package to find all consumer packages affected by changes.
- [x] **Interactive Cytoscape.js Canvas:** Real-time directed graph visualization with pan, zoom, node selection, color coding, and responsive layout.

### Phase 2 — In-Memory "What-If" Change Simulation Engine
- [x] **Non-Destructive Simulation (`POST /api/simulate`):** Evaluates additions, removals, and upgrades on an isolated deep copy without modifying the baseline graph or files.
- [x] **Simulate Add Dependency:** Simulates adding packages/edges to root or internal nodes with duplicate check prevention.
- [x] **Simulate Remove Dependency:** Simulates edge or package removal; identifies orphaned unreachable packages.
- [x] **Simulate Upgrade Dependency:** Simulates package version updates and re-evaluates downstream blast radius without unverified claims of runtime compatibility.
- [x] **Cycle Delta Tracking:** Reports newly introduced circular dependency loops and loops broken/eliminated by mutations.
- [x] **Visual Diff Overlays in Cytoscape:** Highlights added nodes (emerald), ghosted removed nodes/edges (dashed red), and orphaned nodes (orange) with instant reset back to baseline.

### Phase 3 — Security Intelligence & Dependency Freshness Analysis
- [x] **OSV API Integration (`POST /api/security/scan`):** Dedicated client querying Google's OSV database (`https://api.osv.dev/v1/query`) with pinned concrete versions, GHSA/CVE extraction, severity levels, and fixed version parsing.
- [x] **LibYear Technical Lag Scoring (`POST /api/freshness/analyze`):** Chronological age lag metric $\text{LibYear} = \max(0.0, (\text{analysis\_date} - \text{release\_date})/365.25)$ with clean project total and average computations (excluding unscored packages from average denominator).
- [x] **Fault-Tolerant & Offline-Resilient:** Graceful handling of network timeouts, rate limits, and partial failures without breaking core graph functionality.
- [x] **Interactive Dashboard Panel:** Dedicated React UI component for launching security audits, reviewing advisory cards, and viewing LibYear lag metrics.
- [x] **Visual Vulnerability Graph Badges:** Prominent rose/red node outlines and warning indicators on Cytoscape.js canvas for packages with reported advisories.

### Phase 4 — PostgreSQL Persistence & Analysis History
- [x] **SQLAlchemy 2.0 ORM & Alembic:** Normalized relational models (`projects`, `analysis_runs`, `graph_snapshots`, `vulnerability_findings`, `freshness_records`, `simulation_runs`).
- [x] **Immutable Graph Snapshots:** Reconstruct historical Cytoscape graphs strictly preserving the $A \rightarrow B$ convention.
- [x] **Isolated Simulation History:** What-If change simulations are persisted independently and never mutate baseline analysis snapshots.
- [x] **Frontend Project History Panel:** Manage projects, view audit timestamps, and reload past graph snapshots into the active view with one click.
- [x] **Decoupled Architecture:** Runs seamlessly in-memory if PostgreSQL is disconnected or unconfigured.

---

## 3. Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Cytoscape.js, Axios, Lucide Icons
- **Backend:** Python 3.10+, FastAPI, Uvicorn, NetworkX, Pydantic v2, Pytest
- **Database:** PostgreSQL, SQLAlchemy 2.0, Alembic, psycopg2 *(Runs completely in-memory when database is unavailable)*

---

## 4. Getting Started (Windows PowerShell)

### Prerequisites
- Python 3.10+
- Node.js v18+ and `npm`
- *(Optional)* PostgreSQL 14+ for persistent project storage

### Backend Setup & Launch
```powershell
# Navigate to backend directory
cd "DS CP/backend"

# (Optional) Activate your virtual environment if one is created
# python -m venv venv
# .\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run automated tests
pytest tests/ -v

# Start FastAPI server with live reload
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The backend API and documentation will be available at:
- **API Base:** `http://127.0.0.1:8000/api`
- **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`
- **Health Endpoint:** `http://127.0.0.1:8000/api/health`

### Frontend Setup & Launch
Open a new PowerShell terminal:
```powershell
# Navigate to frontend directory
cd "DS CP/frontend"

# Install packages
npm.cmd install

# Start Vite development server
npm.cmd run dev
```
The interactive web dashboard will be available at:
- **Web Dashboard:** `http://127.0.0.1:5173/`

---

## 5. DSA Mapping & Complexity Summary

Detailed algorithms and mathematical models are documented in [`docs/DSA_MAPPING.md`](docs/DSA_MAPPING.md):
- **Adjacency List Directed Graph:** $\mathcal{O}(|V| + |E|)$ space.
- **BFS Shortest Hop Distance:** $\mathcal{O}(|V| + |E|)$ time.
- **Cycle Detection (Tarjan / DFS):** $\mathcal{O}(|V| + |E|)$ time.
- **Topological Sort (Kahn's):** $\mathcal{O}(|V| + |E|)$ time.
- **Reverse Downstream Reachability:** $\mathcal{O}(|V_{\text{sub}}| + |E_{\text{sub}}|)$ time.

---

## 6. Project Structure

```text
DS CP/
├── frontend/                     # React + Vite + Tailwind + Cytoscape.js dashboard
│   ├── src/
│   │   ├── components/           # Cytoscape graph, inspector, uploader, summary cards
│   │   ├── services/             # Axios API client
│   │   ├── App.jsx               # Main dashboard layout and state
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/                      # FastAPI + NetworkX analysis engine
│   ├── app/
│   │   ├── api/routes/           # REST endpoints (/health, /info, /analyze, /impact)
│   │   ├── core/                 # Configuration and environment settings
│   │   ├── schemas/              # Pydantic validation schemas
│   │   ├── parsers/              # Node.js manifest and lockfile parsers
│   │   ├── services/             # NetworkX graph service & algorithms
│   │   └── main.py               # FastAPI entry point
│   ├── tests/                    # Pytest automated test suite
│   ├── requirements.txt
│   └── .env.example
├── docs/                         # Architecture, API contract, DSA mapping, Roadmap
├── sample-projects/              # Deterministic test cases (sample Node.js project)
├── .gitignore
└── README.md
```
