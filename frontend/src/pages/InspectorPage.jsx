import React, { useState } from 'react';
import {
  Activity,
  Target,
  ShieldAlert,
  Clock,
  Layers,
  ArrowRight,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Sparkles,
  GitFork,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { getDownstreamImpact } from '../services/api';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function InspectorPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    displayNodes,
    selectedNode,
    setSelectedNode,
    analysisResult,
    securityResult,
    freshnessResult,
    isSimulatedActive,
    simulationResult
  } = useAnalysis();

  const [impactData, setImpactData] = useState(null);
  const [isImpactLoading, setIsImpactLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const nodeObj = displayNodes.find((n) => n.name === selectedNode);

  const isSimulatedNode = Boolean(
    isSimulatedActive && simulationResult?.diff?.added_nodes?.includes(selectedNode)
  );

  const handleComputeImpact = async () => {
    if (!selectedNode) return;
    setIsImpactLoading(true);
    try {
      const res = await getDownstreamImpact(selectedNode, analysisResult?.analysis_id);
      setImpactData(res);
    } catch (err) {
      console.error("Failed to compute downstream impact", err);
    } finally {
      setIsImpactLoading(false);
    }
  };

  // Find security advisories for this package
  const packageVulns = React.useMemo(() => {
    if (!selectedNode || !securityResult || isSimulatedNode) return [];
    if (securityResult.results) {
      const match = securityResult.results.find(r => r.package_name === selectedNode);
      return match?.vulnerabilities || [];
    }
    if (securityResult.findings) {
      return securityResult.findings
        .filter(f => f.package_name === selectedNode && f.scan_status === 'vulnerable')
        .map(f => ({
          id: f.vuln_id,
          summary: f.summary,
          severity: f.severity,
          fixed_versions: f.fixed_versions || []
        }));
    }
    return [];
  }, [selectedNode, securityResult, isSimulatedNode]);

  // Find freshness record for this package
  const packageFreshness = React.useMemo(() => {
    if (!selectedNode || !freshnessResult || isSimulatedNode) return null;
    const list = freshnessResult.results || freshnessResult.records || freshnessResult.packages || [];
    return list.find(p => (p.package_name || p.packageName) === selectedNode) || null;
  }, [selectedNode, freshnessResult, isSimulatedNode]);

  if (!analysisResult) {
    return (
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-10 text-center text-slate-500 dark:text-slate-400 space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl w-fit mx-auto border border-indigo-500/20">
          <Activity className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Analysis Available</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Please analyze a manifest or load a snapshot to inspect individual packages, reverse dependencies, and blast radius cascades.
          </p>
        </div>
      </div>
    );
  }

  const filteredPackageList = displayNodes.filter(n =>
    n.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 shadow-sm">
              <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Package Deep-Dive & Downstream Blast Radius Inspector
                </h2>
                {isSimulatedActive && (
                  <span className="text-[10px] font-mono bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span>Simulation Mode</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect graph properties, root hop distance, in/out degrees, and compute reverse dependency blast radius cascades
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Package Selector List */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-4.5 space-y-3.5 shadow-2xs dark:shadow-card h-fit transition-colors duration-200">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.06] pb-2.5">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Package Registry ({displayNodes.length})</span>
            <span className="text-[10px] font-mono text-slate-500">Select to inspect</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search package name..."
              className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl pl-8.5 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition duration-150"
            />
          </div>

          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredPackageList.map((node) => {
              const isSelected = node.name === selectedNode;
              return (
                <button
                  key={node.name}
                  onClick={() => {
                    setSelectedNode(node.name);
                    setImpactData(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between group duration-150 ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-semibold shadow-glow-sm border border-indigo-400/40'
                      : 'bg-slate-50 dark:bg-[#070b14]/80 hover:bg-slate-100 dark:hover:bg-[#141b2e] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.04]'
                  }`}
                >
                  <span className="truncate max-w-[170px]">{node.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-sans ${
                    isSelected ? 'bg-black/30 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {node.dep_type || 'pkg'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Package Details & Blast Radius (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {!nodeObj ? (
            <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-3 shadow-2xs dark:shadow-card">
              <div className="p-3 bg-slate-100 dark:bg-slate-800/60 text-slate-500 rounded-xl w-fit mx-auto border border-slate-200 dark:border-slate-700/60">
                <Layers className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-300">No Package Selected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select any package from the list on the left to inspect its dependency structure, security posture, and downstream cascade.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">

              {/* Package Header Card */}
              <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-2xs dark:shadow-card transition-colors duration-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                      Package Specification
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">{nodeObj.name}</h3>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isSimulatedNode && (
                      <span className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 px-2.5 py-1 rounded-full font-semibold">
                        + Simulated Addition
                      </span>
                    )}
                    <span className="text-xs font-mono bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/25 px-3 py-1 rounded-full font-semibold">
                      {nodeObj.version ? `v${nodeObj.version}` : 'Version Unknown'}
                    </span>
                  </div>
                </div>

                {/* Graph Attribute Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Classification</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize font-mono text-sm mt-0.5 block">{nodeObj.dep_type}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Root Hop Distance</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-sm mt-0.5 block">
                      {nodeObj.depth !== null ? `${nodeObj.depth} hops` : 'Unreachable'}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Out-Degree (Deps)</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-sm mt-0.5 block">{nodeObj.out_degree} pkgs</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">In-Degree (Dependents)</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-sm mt-0.5 block">{nodeObj.in_degree} pkgs</span>
                  </div>
                </div>

                {/* Security and Freshness Cross-Reference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Security Status */}
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-700 dark:text-slate-300">
                        <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                        <span>Security Advisories</span>
                      </div>
                      {isSimulatedActive && !isSimulatedNode && (
                        <span className="text-[10px] text-slate-500 font-mono">Baseline Record</span>
                      )}
                    </div>
                    {isSimulatedNode ? (
                      <span className="text-slate-500 italic block">Simulated package; not in baseline scan</span>
                    ) : packageVulns.length > 0 ? (
                      <div className="text-rose-600 dark:text-rose-400 font-semibold font-mono text-xs flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        <span>{packageVulns.length} known vulnerability finding(s)</span>
                      </div>
                    ) : securityResult ? (
                      <div className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Clean / No published CVEs</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic block">No security scan run yet</span>
                    )}
                  </div>

                  {/* Freshness Status */}
                  <div className="bg-slate-50 dark:bg-[#070b14] p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-700 dark:text-slate-300">
                        <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <span>LibYear Aging</span>
                      </div>
                      {isSimulatedActive && !isSimulatedNode && (
                        <span className="text-[10px] text-slate-500 font-mono">Baseline Record</span>
                      )}
                    </div>
                    {isSimulatedNode ? (
                      <span className="text-slate-500 italic block">Simulated package; not in baseline scan</span>
                    ) : packageFreshness && packageFreshness.libyear !== null && packageFreshness.libyear !== undefined ? (
                      <div className="text-cyan-700 dark:text-cyan-300 font-mono font-semibold flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse"></span>
                        <span>{Number(packageFreshness.libyear).toFixed(2)} LibYears technical lag</span>
                      </div>
                    ) : freshnessResult ? (
                      <span className="text-slate-500 dark:text-slate-400 block">Unscored in registry</span>
                    ) : (
                      <span className="text-slate-500 italic block">No freshness scan run yet</span>
                    )}
                  </div>
                </div>

                {/* Blast Radius Action Button */}
                <div className="pt-2">
                  <motion.button
                    onClick={handleComputeImpact}
                    disabled={isImpactLoading || nodeObj.is_root}
                    whileHover={isImpactLoading || nodeObj.is_root ? {} : { scale: 1.01 }}
                    whileTap={isImpactLoading || nodeObj.is_root ? {} : { scale: 0.98 }}
                    className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-glow-sm transition duration-200"
                  >
                    <Target className={`w-4 h-4 ${isImpactLoading ? 'animate-spin' : ''}`} />
                    <span>
                      {isImpactLoading
                        ? 'Traversing Reverse Dependency Tree (BFS)...'
                        : `Calculate Downstream Blast Radius for "${nodeObj.name}"`
                      }
                    </span>
                  </motion.button>
                </div>
              </div>

              {/* Blast Radius Results */}
              <AnimatePresence>
                {impactData && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: easeSoft }}
                    className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 space-y-4 shadow-2xs dark:shadow-card overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
                      <span className="text-sm font-bold text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                        <span>Downstream Blast Radius: {impactData.affected_count} Affected Packages</span>
                      </span>
                      <span className="text-xs font-mono bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 px-2.5 py-1 rounded-full font-bold">
                        Impact Factor: {((impactData.affected_count / Math.max(1, displayNodes.length)) * 100).toFixed(1)}% of graph
                      </span>
                    </div>

                    {impactData.affected_count === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                        Zero downstream packages depend on this node. It is a leaf package or top-level consumer.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          A breaking change, bug, or vulnerability in <span className="text-slate-900 dark:text-white font-mono font-bold">{selectedNode}</span> cascades directly or transitively into:
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {impactData.affected_packages.map((pkg) => (
                            <div
                              key={pkg}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#070b14] px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.1] transition"
                            >
                              <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{pkg}</span>
                              {impactData.reverse_dependency_paths[pkg] && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
                                  <span className="text-slate-400 dark:text-slate-500">Path:</span>
                                  <span className="font-mono text-cyan-700 dark:text-cyan-400 font-medium">
                                    {impactData.reverse_dependency_paths[pkg][0].join(' → ')}
                                  </span>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
