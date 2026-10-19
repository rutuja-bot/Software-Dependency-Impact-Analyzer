# Node.js Sample Demo Service

A deterministic sample Node.js project created for validating manifest parsing, lockfile traversal, directed graph construction, and downstream impact analysis.

## Files
- `package.json`: Declares direct runtime dependencies (`express`, `dotenv`, `winston`) and development dependencies (`jest`).
- `package-lock.json`: Resolves transitive dependencies (`accepts`, `cookie`, `body-parser`, `qs`, `mime-types`, `async`, `colors`, etc.) using `lockfileVersion: 3`.

## Testing Graph Construction
1. Start the analyzer dashboard.
2. In the **Project Manifest Input** panel, click **Reset to Sample Data** or copy the contents of `package.json` and `package-lock.json`.
3. Click **Analyze Dependency Graph**.
4. The analyzer will parse the lockfile tree, identify direct vs transitive dependencies, verify that the graph is an acyclic DAG, and display the topological build order.
5. Click on `accepts` or `cookie` to compute their reverse blast radius.
