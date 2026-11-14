import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Info,
  Layers,
  Eye,
  Sparkles,
  Download,
  Search,
  Grid,
  GitBranch,
  CircleDot
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

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
  const [legendOpen, setLegendOpen] = useState(true);
  const [layoutName, setLayoutName] = useState('cose');
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const { isDark } = useTheme();
  const shouldReduceMotion = useReducedMotion();

  // Keep latest refs for callbacks and selection to avoid stale closures in Cytoscape event handlers
  const selectedNodeRef = useRef(selectedNode);
  const onSelectNodeRef = useRef(onSelectNode);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

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
      let borderColor = isDark ? '#1e293b' : '#cbd5e1';
      let borderWidth = 2;

      const isVulnerable = vulnerableMap.has(n.name);

      if (n.is_root) {
        nodeColor = '#10b981'; // Emerald for root
        borderColor = '#059669';
        borderWidth = 3.5;
      } else if (n.dep_type === 'direct') {
        nodeColor = '#818cf8'; // Indigo for direct
        borderColor = '#4f46e5';
      } else if (n.dep_type === 'dev') {
        nodeColor = '#f59e0b'; // Amber for dev
        borderColor = '#d97706';
      }

      // Vulnerability overlay takes precedence for alerting
      if (isVulnerable) {
        borderColor = '#f43f5e'; // Rose-500 red border
        borderWidth = 3.5;
      }

      // Diff styling
      if (addedNodesSet.has(n.name)) {
        nodeColor = '#10b981';
        borderColor = '#34d399';
        borderWidth = 3.5;
      } else if (orphanedNodesSet.has(n.name)) {
        nodeColor = '#f97316';
        borderColor = '#fb923c';
        borderWidth = 3;
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
      let lineColor = isDark ? '#475569' : '#94a3b8';
      let arrowColor = isDark ? '#64748b' : '#64748b';
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

    const layoutOptions = {
      cose: {
        name: 'cose',
        animate: false,
        randomize: false,
        componentSpacing: 95,
        nodeRepulsion: 7500,
        nodeOverlap: 35,
        idealEdgeLength: 85,
        edgeElasticity: 100,
        padding: 45,
      },
      breadthfirst: {
        name: 'breadthfirst',
        directed: true,
        padding: 45,
        spacingFactor: 1.25,
        animate: false,
      },
      concentric: {
        name: 'concentric',
        concentric: (node) => (node.data('isRoot') ? 10 : 10 - (node.data('depth') || 1)),
        levelWidth: () => 2,
        padding: 45,
        animate: false,
      },
      circle: {
        name: 'circle',
        padding: 45,
        animate: false,
      }
    };

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': isDark ? '#f8fafc' : '#0f172a',
            'font-size': '11px',
            'font-weight': '600',
            'font-family': 'ui-sans-serif, system-ui, -apple-system, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'text-halign': 'center',
            'text-outline-color': isDark ? '#080c16' : '#ffffff',
            'text-outline-width': isDark ? 2.5 : 2,
            'text-max-width': '130px',
            'text-wrap': 'wrap',
            'width': 'mapData(depth, 0, 5, 42, 28)',
            'height': 'mapData(depth, 0, 5, 42, 28)',
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': '0.22s',
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
            'border-color': '#06b6d4',
            'background-color': '#22d3ee',
            'shadow-blur': 18,
            'shadow-color': '#06b6d4',
            'shadow-opacity': 0.85,
            'z-index': 100,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#06b6d4',
            'shadow-blur': 20,
            'shadow-color': '#06b6d4',
            'shadow-opacity': 0.9,
            'z-index': 99,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#06b6d4',
            'target-arrow-color': '#06b6d4',
            'width': 2.75,
            'opacity': 1,
            'z-index': 98,
          },
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.22,
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
            'opacity': 0.85,
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': '0.2s',
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
      layout: layoutOptions[layoutName] || layoutOptions.cose,
    });

    // Container fitting on layout completion with smooth entrance
    cy.on('layoutstop', () => {
      cy.resize();
      cy.fit(null, 45);
    });

    // Fallback fit
    const timer = setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.resize();
        cyRef.current.fit(null, 45);
      }
    }, 60);

    // Resize observer (resizes canvas viewport buffer without resetting user zoom/pan)
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (cyRef.current) {
          cyRef.current.resize();
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    // Node click handler (uses latest onSelectNode ref to avoid stale closure)
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (onSelectNodeRef.current) {
        onSelectNodeRef.current(node.data('id'));
      }
    });

    // Background tap clears selection
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        if (onSelectNodeRef.current) {
          onSelectNodeRef.current(null);
        }
        cy.elements().removeClass('highlighted dimmed');
      }
    });

    // Hover micro-interactions (uses latest selectedNode ref to avoid stale closure)
    cy.on('mouseover', 'node', (evt) => {
      if (!selectedNodeRef.current) {
        const node = evt.target;
        node.connectedEdges().addClass('highlighted');
      }
    });

    cy.on('mouseout', 'node', (evt) => {
      if (!selectedNodeRef.current) {
        const node = evt.target;
        node.connectedEdges().removeClass('highlighted');
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
  }, [nodes, edges, diff, isSimulated, securityResult, isDark, layoutName]);

  // Handle in-canvas search highlighting and gliding
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (!graphSearchQuery.trim()) {
      if (!selectedNode) {
        cy.elements().removeClass('highlighted dimmed');
      }
      return;
    }

    const q = graphSearchQuery.toLowerCase();
    const matches = cy.nodes().filter(n => n.data('id').toLowerCase().includes(q));

    if (matches.length > 0) {
      cy.elements().addClass('dimmed');
      matches.removeClass('dimmed').addClass('highlighted');
      matches.connectedEdges().removeClass('dimmed').addClass('highlighted');

      cy.animate({
        center: { eles: matches.first() },
        duration: shouldReduceMotion ? 0 : 250,
        easing: 'ease-out'
      });
    } else {
      cy.elements().removeClass('highlighted dimmed');
    }
  }, [graphSearchQuery, selectedNode, shouldReduceMotion]);

  // Handle external selection with smooth camera focus and neighborhood highlighting
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.nodes().unselect();
    cy.elements().removeClass('highlighted dimmed');

    if (selectedNode) {
      const target = cy.getElementById(selectedNode);
      if (target.length > 0) {
        target.select();
        const connectedEdges = target.connectedEdges();
        const connectedNodes = connectedEdges.connectedNodes();

        cy.elements().addClass('dimmed');
        target.removeClass('dimmed').addClass('highlighted');
        connectedEdges.removeClass('dimmed').addClass('highlighted');
        connectedNodes.removeClass('dimmed').addClass('highlighted');

        cy.animate({
          center: { eles: target },
          duration: shouldReduceMotion ? 0 : 250,
          easing: 'ease-out'
        });
      }
    }
  }, [selectedNode, shouldReduceMotion]);

  // Canvas Control Handlers with smooth camera animations
  const handleZoomIn = () => {
    if (cyRef.current) {
      const cy = cyRef.current;
      cy.animate({
        zoom: {
          level: cy.zoom() * 1.25,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
        },
        duration: shouldReduceMotion ? 0 : 180,
        easing: 'ease-out'
      });
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      const cy = cyRef.current;
      cy.animate({
        zoom: {
          level: cy.zoom() * 0.8,
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
        },
        duration: shouldReduceMotion ? 0 : 180,
        easing: 'ease-out'
      });
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.animate({
        fit: { eles: cyRef.current.elements(), padding: 45 },
        duration: shouldReduceMotion ? 0 : 240,
        easing: 'ease-out'
      });
    }
  };

  const handleReset = () => {
    if (cyRef.current) {
      const cy = cyRef.current;
      cy.animate({
        pan: { x: 0, y: 0 },
        zoom: 1,
        duration: shouldReduceMotion ? 0 : 200,
        easing: 'ease-out'
      }, {
        complete: () => {
          cy.animate({
            fit: { eles: cy.elements(), padding: 45 },
            duration: shouldReduceMotion ? 0 : 200,
            easing: 'ease-out'
          });
        }
      });
    }
  };

  // Export high-resolution PNG
  const handleExportPng = () => {
    if (!cyRef.current) return;
    try {
      const pngUri = cyRef.current.png({ full: true, scale: 2, bg: isDark ? '#080c16' : '#ffffff' });
      const a = document.createElement('a');
      a.href = pngUri;
      a.download = `dependency-graph-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.warn("PNG export failed", e);
    }
  };

  return (
    <div className="relative w-full h-[560px] bg-slate-100 dark:bg-[#070b14] rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-inner group transition-colors duration-200">

      {/* Background Grid Accent */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none"></div>

      {/* Cytoscape Canvas */}
      <div ref={containerRef} className="w-full h-full relative z-0" />

      {/* Top Floating Controls Bar */}
      <div className="absolute top-3.5 left-3.5 right-3.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">

        {/* In-Canvas Search Filter */}
        <div className="pointer-events-auto relative w-48 sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={graphSearchQuery}
            onChange={(e) => setGraphSearchQuery(e.target.value)}
            placeholder="Filter node in canvas..."
            className="w-full bg-white/95 dark:bg-[#0c111e]/95 backdrop-blur-md border border-slate-200 dark:border-white/[0.1] rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 shadow-md font-mono transition"
          />
        </div>

        {/* Action Controls & Layout Switcher */}
        <div className="pointer-events-auto flex items-center space-x-1.5 bg-white/95 dark:bg-[#0c111e]/95 backdrop-blur-md border border-slate-200 dark:border-white/[0.1] p-1 rounded-xl shadow-lg transition-colors duration-200 text-xs">
          {/* Layout Switcher Dropdown */}
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            title="Change graph layout algorithm"
            className="bg-transparent text-slate-700 dark:text-slate-300 font-medium px-2 py-1 rounded-lg focus:outline-none cursor-pointer text-xs"
          >
            <option value="cose" className="dark:bg-slate-900">Force (COSE)</option>
            <option value="breadthfirst" className="dark:bg-slate-900">Hierarchy (Tree)</option>
            <option value="concentric" className="dark:bg-slate-900">Concentric Rings</option>
            <option value="circle" className="dark:bg-slate-900">Radial Circle</option>
          </select>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700/80 mx-0.5" />

          {/* Zoom In */}
          <motion.button
            type="button"
            onClick={handleZoomIn}
            whileTap={shouldReduceMotion ? {} : { scale: 0.92 }}
            title="Zoom In"
            aria-label="Zoom In"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-lg transition"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </motion.button>

          {/* Zoom Out */}
          <motion.button
            type="button"
            onClick={handleZoomOut}
            whileTap={shouldReduceMotion ? {} : { scale: 0.92 }}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-lg transition"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </motion.button>

          {/* Fit Viewport */}
          <motion.button
            type="button"
            onClick={handleFit}
            whileTap={shouldReduceMotion ? {} : { scale: 0.92 }}
            title="Fit Graph to Viewport"
            aria-label="Fit Graph to Viewport"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-lg transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </motion.button>

          {/* Reset Zoom & Pan */}
          <motion.button
            type="button"
            onClick={handleReset}
            whileTap={shouldReduceMotion ? {} : { scale: 0.92 }}
            title="Reset Zoom & Pan"
            aria-label="Reset Zoom & Pan"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </motion.button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700/80 mx-0.5" />

          {/* Export PNG */}
          <motion.button
            type="button"
            onClick={handleExportPng}
            whileTap={shouldReduceMotion ? {} : { scale: 0.92 }}
            title="Export high-resolution PNG"
            aria-label="Export high-resolution PNG"
            className="p-1.5 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 rounded-lg transition"
          >
            <Download className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>

      {/* Floating Canvas Legend */}
      <div className="absolute bottom-3.5 left-3.5 bg-white/95 dark:bg-[#0c111e]/95 backdrop-blur-md border border-slate-200 dark:border-white/[0.1] rounded-2xl text-xs shadow-lg z-10 transition-colors duration-200 overflow-hidden max-w-[280px]">
        <div
          onClick={() => setLegendOpen(!legendOpen)}
          className="flex items-center justify-between px-3.5 py-2 cursor-pointer border-b border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-slate-800/40 select-none"
        >
          <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] flex items-center space-x-2">
            <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Graph Legend {isSimulated ? '(Diff View)' : '(A → B)'}</span>
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-3">
            {legendOpen ? 'Collapse' : 'Expand'}
          </span>
        </div>

        <AnimatePresence>
          {legendOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: easeSoft }}
              className="p-3 space-y-1.5 text-[11px] overflow-hidden"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs inline-block"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Project Root / Consumer</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-2xs inline-block"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Direct Dependency</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 dark:bg-sky-400 shadow-2xs inline-block"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Transitive Dependency</span>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-rose-500 bg-transparent inline-block"></span>
                <span className="text-rose-600 dark:text-rose-400 font-medium">Has Known Vulnerability</span>
              </div>
              {isSimulated && (
                <>
                  <div className="pt-1.5 border-t border-slate-200 dark:border-white/[0.06] mt-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Simulation Overlays</span>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 inline-block"></span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">+ Added Element</span>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                    <span className="text-rose-700 dark:text-rose-300 font-medium">- Removed Element</span>
                  </div>
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                    <span className="text-amber-700 dark:text-amber-300 font-medium">~ Orphaned Package</span>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
