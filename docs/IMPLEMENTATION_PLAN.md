# Implementation Plan: Software Dependency Impact Analyzer

This document outlines the phased roadmap for building, hardening, and extending the Software Dependency Impact Analyzer.

---

## Phase 1 — Project Foundation & Core Graph Engine (Completed)
- **Objectives:**
  - Establish clean, modular directory structure inside root `DS CP/`.
  - Implement FastAPI backend with Pydantic request/response schemas.
  - Implement Node.js parser supporting `package.json` and `package-lock.json` (v1, v2, v3).
  - Implement `NetworkX` directed graph builder enforcing $A \rightarrow B$ edge convention.
  - Implement BFS hop calculation, cycle detection, topological sorting, and reverse blast radius calculation.
  - Implement React + Vite frontend with Tailwind CSS and Cytoscape.js interactive graph canvas.
  - Provide automated Pytest unit tests verifying parsing, edge direction, and cycle detection.
- **Acceptance Criteria:**
  - Automated tests pass with 100% success.
  - Frontend builds cleanly without bundler errors.
  - Manifest parsing and live interactive graph visualization work end-to-end.

---

## Phase 2 — In-Memory "What-If" Change Simulation Engine (Completed)
- **Objectives:**
  - Implement simulation service allowing developers to evaluate hypothetical changes without modifying files:
    1. **Add Dependency:** Simulates introducing a new package with hypothetical dependencies.
    2. **Update Dependency:** Simulates updating a package version and evaluates affected downstream consumers.
    3. **Remove Dependency:** Evaluates orphaned packages and downstream broken imports.
  - Provide graph diffing algorithm ($\Delta G = G' \setminus G$) highlighting added/removed edges and impacted blast radius.
- **Acceptance Criteria:**
  - Interactive simulator panel in React allowing package add/upgrade/drop previews.
  - Instant visual delta diff highlighting on the Cytoscape.js canvas with ghosted removed elements and highlighted new additions.
  - Baseline graph and manifest files remain strictly isolated and unmodified.
  - 10 automated simulation unit/integration tests passing.

---

## Phase 3 — Dependency Freshness & Vulnerability Cross-Referencing (Completed)
- **Objectives:**
  - Integrate OSV REST API (`https://api.osv.dev/v1/query`) client to map packages against known CVEs and GHSAs.
  - Implement LibYear calculation to compute dependency lag (difference between installed version release date and analysis date).
  - Ensure local graph analysis continues gracefully if external network requests fail or time out.
  - Deduplicate queries and cache registry release dates in-memory.
  - Support concrete versions and explicitly handle loose/unresolved constraints without masking risks.
- **Acceptance Criteria:**
  - Dedicated endpoints: `POST /api/security/scan` and `POST /api/freshness/analyze`.
  - Interactive React panel for running on-demand OSV audits and LibYear freshness calculations.
  - Visual vulnerability indicators and badges on Cytoscape.js graph canvas.
  - 15 comprehensive automated backend tests covering all 14 required failure and success scenarios without internet dependency.
  - Frontend production build succeeds cleanly.

---

## Phase 4 — Persistence & Multi-Project History (Completed)
- **Objectives:**
  - Introduce PostgreSQL persistence with SQLAlchemy 2.0 and Alembic migrations.
  - Enable saving projects, viewing historical scans, and retrieving immutable graph snapshots.
  - Maintain the capability to run the analysis engine in-memory without database configuration.
  - Persist What-If simulations separately from baseline analysis runs without snapshot mutation.
- **Acceptance Criteria:**
  - Alembic migrations initialized (`alembic/versions/0001_initial_schema.py`) and schema defined.
  - Projects and historical analysis runs accessible via REST endpoints (`/api/projects`, `/api/analyses`).
  - React frontend includes interactive `ProjectHistoryPanel` with snapshot reload capability.
  - Automated tests cover database transactions, foreign-key cascades, and offline fallbacks.

