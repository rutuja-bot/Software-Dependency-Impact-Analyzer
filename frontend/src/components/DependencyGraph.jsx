import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

export default function DependencyGraph({ 
  nodes, 
  edges, 
  onSelectNode, 
  selectedNode,
  diff = null,
  isSimulated = false,
  securityResult = null
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !nodes || nodes.length === 0) return;

    const addedNodesSet = new Set(diff?.added_nodes || []);
    const removedNodesSet = new Set(diff?.removed_nodes || []);
    const orphanedNodesSet = new Set(diff?.orphaned_nodes || []);

    const vulnerableMap = new Map();
    if (securityResult?.packages) {
      securityResult.packages.forEach((pkg) => {
        if (pkg.vulnerability_count > 0) {
          vulnerableMap.set(pkg.package_name, pkg.vulnerabilities);
        }
      });
    } else if (securityResult?.results) {
      securityResult.results.forEach((pkg) => {
        if (pkg.status === 'vulnerable' && pkg.vulnerabilities && pkg.vulnerabilities.length > 0) {
          vulnerableMap.set(pkg.package_name, pkg.vulnerabilities);
        }
      });
    } else if (securityResult?.findings) {
      securityResult.findings.forEach((finding) => {
        if (finding.scan_status === 'vulnerable') {
          const existing = vulnerableMap.get(finding.package_name) || [];
          existing.push({
            id: finding.vuln_id,
            summary: finding.summary,
            severity: finding.severity,
            fixed_versions: finding.fixed_versions || []
          });
          vulnerableMap.set(finding.package_name, existing);
        }
      });
    }

    const addedEdgesKeySet = new Set(
      (diff?.added_edges || []).map((e) => `${e.source}->${e.target}`)
    );
    const removedEdgesKeySet = new Set(
      (diff?.removed_edges || []).map((e) => `${e.source}->${e.target}`)
    );

    // Build Cytoscape elements
    const elements = [];

    // Add nodes
    nodes.forEach((n) => {
      let nodeColor = '#38bdf8'; // Sky blue for transitive
      let borderColor = '#1e293b';
      let borderWidth = 2;

      const isVulnerable = vulnerableMap.has(n.name);

      if (n.is_root) nodeColor = '#10b981'; // Green for root
      else if (n.dep_type === 'direct') nodeColor = '#818cf8'; // Indigo for direct
      else if (n.dep_type === 'dev') nodeColor = '#f59e0b'; // Amber for dev

      // Vulnerability overlay takes precedence for alerting unless removed
      if (isVulnerable) {
        borderColor = '#f43f5e'; // Rose-500 red border
        borderWidth = 4;
      }

      // Diff styling
      if (addedNodesSet.has(n.name)) {
        nodeColor = '#10b981';
        borderColor = '#34d399';
        borderWidth = 4;
      } else if (orphanedNodesSet.has(n.name)) {
        nodeColor = '#f97316';
        borderColor = '#fb923c';
      }

      const vulnSuffix = isVulnerable ? ` [⚠️ ${vulnerableMap.get(n.name).length} VULN]` : '';

      elements.push({
        data: {
          id: n.name,
          label: n.name + (addedNodesSet.has(n.name) ? ' [NEW]' : '') + (orphanedNodesSet.has(n.name) ? ' [ORPHAN]' : '') + vulnSuffix,
          version: n.version || 'unknown',
          isRoot: n.is_root,
          depType: n.dep_type,
          depth: n.depth ?? 'N/A',
          color: nodeColor,
          borderColor: borderColor,
          borderWidth: borderWidth,
        },
      });
    });

    // Add removed nodes as ghosted red nodes if viewing simulated diff
    if (diff?.removed_nodes) {
      diff.removed_nodes.forEach((rName) => {
        elements.push({
          data: {
            id: rName,
            label: `${rName} [REMOVED]`,
            version: 'removed',
            isRoot: false,
            depType: 'removed',
            depth: 0,
            color: '#ef4444',
            borderColor: '#f87171',
            borderWidth: 3,
          },
          classes: 'ghost-removed',
        });
      });
    }

    // Add active edges: A -> B means A depends on B
    edges.forEach((e, idx) => {
      const edgeKey = `${e.source}->${e.target}`;
      let lineColor = '#475569';
      let arrowColor = '#64748b';
      let edgeWidth = 1.5;

      if (addedEdgesKeySet.has(edgeKey)) {
        lineColor = '#10b981';
        arrowColor = '#34d399';
        edgeWidth = 3;
      }

      elements.push({
        data: {
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
          label: e.version_constraint || '',
          lineColor: lineColor,
          arrowColor: arrowColor,
          edgeWidth: edgeWidth,
        },
      });
    });

    // Add ghost removed edges if any
    if (diff?.removed_edges) {
      diff.removed_edges.forEach((re, idx) => {
        elements.push({
          data: {
            id: `re-${idx}`,
            source: re.source,
            target: re.target,
            label: '[REMOVED]',
            lineColor: '#ef4444',
            arrowColor: '#f87171',
            edgeWidth: 2,
          },
          classes: 'ghost-removed-edge',
        });
      });
    }

    // Initialize Cytoscape with enhanced layout, spacing, and label readability
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': '#f1f5f9',
            'font-size': '11px',
            'font-weight': '600',
            'font-family': 'ui-sans-serif, system-ui, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-halign': 'center',
            'text-outline-color': '#020617',
            'text-outline-width': 2.5,
            'text-max-width': '120px',
            'text-wrap': 'wrap',
            'width': 'mapData(depth, 0, 5, 40, 26)',
            'height': 'mapData(depth, 0, 5, 40, 26)',
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
          },
        },
        {
          selector: 'node.ghost-removed',
          style: {
            'background-opacity': 0.6,
            'border-style': 'dashed',
            'color': '#fca5a5',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#f43f5e',
            'background-color': '#fb7185',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(edgeWidth)',
            'line-color': 'data(lineColor)',
            'target-arrow-color': 'data(arrowColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.85,
            'opacity': 0.8,
          },
        },
        {
          selector: 'edge.ghost-removed-edge',
          style: {
            'line-style': 'dashed',
            'opacity': 0.5,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        randomize: false,
        componentSpacing: 90,
        nodeRepulsion: 7500,
        nodeOverlap: 35,
        idealEdgeLength: 80,
        edgeElasticity: 100,
        padding: 45,
      },
    });

    // Guaranteed initial container fitting on render
    cy.on('layoutstop', () => {
      cy.resize();
      cy.fit(null, 40);
    });

    // Fallback fit after paint completion
    const timer = setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.resize();
        cyRef.current.fit(null, 40);
      }
    }, 60);

    // Dynamic resize observer to maintain fit during route switches or container resizes
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (cyRef.current) {
          cyRef.current.resize();
          cyRef.current.fit(null, 40);
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    // Node click handler
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (onSelectNode) {
        onSelectNode(node.data('id'));
      }
    });

    cyRef.current = cy;

    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      cy.destroy();
    };
  }, [nodes, edges, diff, isSimulated, securityResult]);

  // Handle external selection
  useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.nodes().unselect();
    if (selectedNode) {
      const target = cyRef.current.$(`node[id = "${selectedNode}"]`);
      if (target.length > 0) {
        target.select();
        cyRef.current.center(target);
      }
    }
  }, [selectedNode]);

  // Canvas Control Handlers
  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.resize();
      cyRef.current.fit(null, 40);
    }
  };

  const handleReset = () => {
    if (cyRef.current) {
      cyRef.current.reset();
      cyRef.current.fit(null, 40);
    }
  };

  return (
    <div className="relative w-full h-[520px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner">
      <div ref={containerRef} className="w-full h-full" />

      {/* On-Canvas Graph Toolbar (Zoom & Fit Controls) */}
      <div className="absolute top-3 right-3 flex items-center space-x-1.5 bg-slate-900/90 backdrop-blur border border-slate-800 p-1.5 rounded-lg shadow-lg z-10">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-slate-800" />
        <button
          type="button"
          onClick={handleFit}
          title="Fit Graph to Viewport"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Reset Zoom & Pan"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-lg text-xs space-y-1.5 shadow-lg pointer-events-none z-10">
        <div className="font-semibold text-slate-300 mb-1 border-b border-slate-800 pb-1">
          Graph Legend {isSimulated ? '(Simulated Diff View)' : '(A → B: A depends on B)'}
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
          <span className="text-slate-300">Project Root / Added</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block"></span>
          <span className="text-slate-300">Direct Dependency</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-sky-400 inline-block"></span>
          <span className="text-slate-300">Transitive Dependency</span>
        </div>
        {isSimulated && (
          <>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
              <span className="text-slate-300">Removed Element</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span>
              <span className="text-slate-300">Orphaned Package</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
