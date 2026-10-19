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
  Sparkles
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { getDownstreamImpact } from '../services/api';

export default function InspectorPage() {
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
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
        <Activity className="w-10 h-10 mx-auto text-slate-500" />
        <h3 className="text-base font-semibold text-slate-200">No Analysis Available</h3>
        <p className="text-xs max-w-md mx-auto">
          Please analyze a manifest or load a snapshot to inspect packages and blast radius metrics.
        </p>
      </div>
    );
  }

  const filteredPackageList = displayNodes.filter(n => 
    n.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <Activity className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                Package Deep-Dive & Downstream Blast Radius Inspector
              </h2>
              {isSimulatedActive && (
                <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-semibold flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Simulation Diff Mode</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Inspect in-degrees, out-degrees, CVE status, LibYear lag, and traverse reverse dependency trees
            </p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Package Selector List */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3 shadow-sm h-fit">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
            <span className="text-xs font-bold text-slate-200">Select Package ({displayNodes.length})</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search package..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {filteredPackageList.map((node) => {
              const isSelected = node.name === selectedNode;
              return (
                <button
                  key={node.name}
                  onClick={() => {
                    setSelectedNode(node.name);
                    setImpactData(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-700/60 text-slate-300'
                  }`}
                >
                  <span className="truncate">{node.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-800 text-slate-400'
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
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-500" />
              <p className="text-xs">Select a package from the list on the left to inspect its dependency structure.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Package Header Card */}
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Package Specification
                    </div>
                    <h3 className="text-xl font-bold text-white font-mono">{nodeObj.name}</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isSimulatedNode && (
                      <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">
                        + Simulated Addition
                      </span>
                    )}
                    <span className="text-xs font-mono bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1 rounded-full font-semibold">
                      {nodeObj.version ? `v${nodeObj.version}` : 'Version Unknown'}
                    </span>
                  </div>
                </div>

                {/* Graph Attribute Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Classification</span>
                    <span className="font-semibold text-slate-200 capitalize font-mono">{nodeObj.dep_type}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Root Hop Distance</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {nodeObj.depth !== null ? `${nodeObj.depth} hops` : 'Unreachable'}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Out-Degree (Dependencies)</span>
                    <span className="font-semibold text-slate-200 font-mono">{nodeObj.out_degree} pkgs</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">In-Degree (Dependents)</span>
                    <span className="font-semibold text-slate-200 font-mono">{nodeObj.in_degree} pkgs</span>
                  </div>
                </div>

                {/* Security and Freshness Cross-Reference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {/* Security Status */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span>Security Advisories</span>
                      </div>
                      {isSimulatedActive && !isSimulatedNode && (
                        <span className="text-[10px] text-slate-500 font-mono">Baseline Record</span>
                      )}
                    </div>
                    {isSimulatedNode ? (
                      <span className="text-slate-500 italic">Simulated package; not in baseline scan</span>
                    ) : packageVulns.length > 0 ? (
                      <div className="text-rose-400 font-semibold font-mono">
                        {packageVulns.length} known vulnerability finding(s)
                      </div>
                    ) : securityResult ? (
                      <div className="text-emerald-400 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Clean / No published advisories</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">No security scan run yet</span>
                    )}
                  </div>

                  {/* Freshness Status */}
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>LibYear Aging</span>
                      </div>
                      {isSimulatedActive && !isSimulatedNode && (
                        <span className="text-[10px] text-slate-500 font-mono">Baseline Record</span>
                      )}
                    </div>
                    {isSimulatedNode ? (
                      <span className="text-slate-500 italic">Simulated package; not in baseline scan</span>
                    ) : packageFreshness && packageFreshness.libyear !== null && packageFreshness.libyear !== undefined ? (
                      <div className="text-sky-300 font-mono font-semibold">
                        {Number(packageFreshness.libyear).toFixed(2)} LibYears lag
                      </div>
                    ) : freshnessResult ? (
                      <span className="text-slate-400">Unscored</span>
                    ) : (
                      <span className="text-slate-500 italic">No freshness scan run yet</span>
                    )}
                  </div>
                </div>

                {/* Blast Radius Action Button */}
                <div className="pt-2">
                  <button
                    onClick={handleComputeImpact}
                    disabled={isImpactLoading || nodeObj.is_root}
                    className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-xs font-semibold py-2.5 px-4 rounded-lg shadow transition"
                  >
                    <Target className="w-4 h-4" />
                    <span>
                      {isImpactLoading ? 'Traversing Reverse Dependency Paths (BFS)...' : `Calculate Downstream Blast Radius for "${nodeObj.name}"`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Blast Radius Results */}
              {impactData && (
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                    <span className="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Downstream Blast Radius: {impactData.affected_count} Affected Packages</span>
                    </span>
                    <span className="text-[11px] font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-bold">
                      Impact Factor: {((impactData.affected_count / Math.max(1, displayNodes.length)) * 100).toFixed(1)}%
                    </span>
                  </div>

                  {impactData.affected_count === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Zero downstream packages depend on this node. It is a leaf package or top-level consumer.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">
                        A breaking change or regression in <span className="text-white font-mono font-bold">{selectedNode}</span> directly or transitively cascades into:
                      </p>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {impactData.affected_packages.map((pkg) => (
                          <div 
                            key={pkg} 
                            className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700/80"
                          >
                            <span className="font-mono text-slate-200 font-semibold">{pkg}</span>
                            {impactData.reverse_dependency_paths[pkg] && (
                              <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                                <span>Path:</span>
                                <span className="font-mono text-teal-400">
                                  {impactData.reverse_dependency_paths[pkg][0].join(' → ')}
                                </span>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
