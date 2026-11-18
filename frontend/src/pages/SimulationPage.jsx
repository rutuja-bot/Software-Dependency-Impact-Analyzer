import React, { useState } from 'react';
import {
  Sparkles,
  RotateCcw,
  Network,
  AlertTriangle,
  CheckCircle,
  Layers,
  ArrowRight,
  GitPullRequest,
  ShieldCheck,
  Flame,
  ShieldAlert,
  GitFork,
  ArrowUpCircle,
  PlusCircle,
  Trash2,
  BookmarkPlus
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import SimulationPanel from '../components/SimulationPanel';
import DependencyGraph from '../components/DependencyGraph';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function SimulationPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    analysisResult,
    simulationResult,
    comparisonResult,
    isSimulatedActive,
    handleSimulationSuccess,
    handleResetSimulation,
    displayNodes,
    displayEdges,
    selectedNode,
    setSelectedNode,
    securityResult
  } = useAnalysis();

  const [viewMode, setViewMode] = useState('comparison'); // 'comparison' | 'graph'

  if (!analysisResult) {
    return (
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-10 text-center text-slate-500 dark:text-[#94A3B8] space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-2xl w-fit mx-auto border border-[#19B6A4]/20">
          <Sparkles className="w-8 h-8 text-[#19B6A4]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">No Baseline Graph Available</h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
            Please analyze a project manifest or load a historical snapshot before running What-If dependency modification simulations.
          </p>
        </div>
      </div>
    );
  }

  const comp = comparisonResult;
  const riskDelta = comp?.risk_delta;
  const vulnDelta = comp?.vulnerability_delta;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-sm">
              <Sparkles className="w-6 h-6 text-[#19B6A4]" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                What-If Change Simulator & Graph Comparison
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
                Simulate adding, upgrading, or removing packages in-memory and compare before-and-after metrics
              </p>
            </div>
          </div>

          {isSimulatedActive && (
            <div className="flex items-center space-x-2.5">
              <motion.button
                onClick={handleResetSimulation}
                whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
                className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#111C2E] dark:hover:bg-[#1c2c44] border border-slate-300 dark:border-[#26364D] text-slate-800 dark:text-[#F1F5F9] text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-2xs duration-150"
              >
                <RotateCcw className="w-4 h-4 text-[#19B6A4]" />
                <span>Reset to Baseline Graph</span>
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Simulation Controls Panel */}
      <SimulationPanel
        nodes={analysisResult.nodes}
        rootPackage={analysisResult.project_name}
        onSimulationSuccess={handleSimulationSuccess}
        onResetSimulation={handleResetSimulation}
        isSimulatedActive={isSimulatedActive}
        simulationResult={simulationResult}
        analysisId={analysisResult.analysis_id}
      />

      {/* BEFORE-AND-AFTER COMPARISON STAGE */}
      {isSimulatedActive && (
        <div className="space-y-6">
          {/* View Mode Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#26364D] pb-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('comparison')}
                className={`py-2 px-4 rounded-xl text-sm font-bold transition ${
                  viewMode === 'comparison'
                    ? 'bg-[#19B6A4] text-[#0B1220] shadow-glow-teal'
                    : 'bg-slate-100 dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                }`}
              >
                Before-and-After Comparison View
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`py-2 px-4 rounded-xl text-sm font-bold transition ${
                  viewMode === 'graph'
                    ? 'bg-[#19B6A4] text-[#0B1220] shadow-glow-teal'
                    : 'bg-slate-100 dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                }`}
              >
                Simulated Graph Canvas
              </button>
            </div>

            <div className="text-xs font-mono text-slate-500 dark:text-[#94A3B8]">
              Operation: <span className="font-bold text-[#19B6A4] uppercase">{simulationResult.operation}</span> ({simulationResult.target_package})
            </div>
          </div>

          {/* Detailed Comparison View */}
          {viewMode === 'comparison' && (
            <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card space-y-6">
              {/* Summary Banner */}
              <div className="p-4 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-[#26364D] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">
                    Simulation Summary
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9]">
                    {comp?.summary || simulationResult.message}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                    {(() => {
                      const summaryText = comp?.summary || simulationResult.message || '';
                      let expl = comp?.impact_explanation || 'In-memory graph modification evaluated.';
                      if (summaryText && expl.startsWith(summaryText)) {
                        expl = expl.slice(summaryText.length).trim();
                      }
                      return expl || 'In-memory graph modification evaluated.';
                    })()}
                  </p>
                </div>
              </div>

              {/* 4 Comparison Metric Delta Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Risk Score Delta */}
                <div className="bg-slate-50 dark:bg-[#111C2E] p-4 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748B] flex items-center space-x-1.5">
                    <Flame className="w-4 h-4 text-[#19B6A4]" />
                    <span>Risk Score Delta</span>
                  </span>
                  {riskDelta ? (
                    <div>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-[#F1F5F9]">
                          {riskDelta.baseline_score} → {riskDelta.simulated_score}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center space-x-1.5 text-xs font-mono">
                        <span className={riskDelta.score_change <= 0 ? 'text-[#22C55E] font-bold' : 'text-[#F05252] font-bold'}>
                          {riskDelta.score_change <= 0 ? `${riskDelta.score_change} pts (Improvement)` : `+${riskDelta.score_change} pts (Increase)`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Baseline evaluation active</div>
                  )}
                </div>

                {/* 2. Vulnerability Changes */}
                <div className="bg-slate-50 dark:bg-[#111C2E] p-4 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748B] flex items-center space-x-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#F05252]" />
                    <span>Security Advisories</span>
                  </span>
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-[#F1F5F9]">
                      {vulnDelta ? (vulnDelta.resolved_count > 0 ? `-${vulnDelta.resolved_count} CVEs` : `0 change`) : 'Unchanged'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                      {vulnDelta?.resolved_count > 0 ? (
                        <span className="text-[#22C55E] font-semibold">{vulnDelta.resolved_count} advisory(ies) resolved</span>
                      ) : (
                        <span>No known new vulnerabilities introduced</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Downstream Impact Shift */}
                <div className="bg-slate-50 dark:bg-[#111C2E] p-4 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748B] flex items-center space-x-1.5">
                    <GitFork className="w-4 h-4 text-[#4C8DCE]" />
                    <span>Downstream Blast Radius</span>
                  </span>
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-[#F1F5F9]">
                      {simulationResult.impact_diff.baseline_affected_count} → {simulationResult.impact_diff.simulated_affected_count}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                      {simulationResult.impact_diff.newly_affected_packages.length > 0 ? (
                        <span className="text-[#F05252] font-semibold">+{simulationResult.impact_diff.newly_affected_packages.length} newly affected</span>
                      ) : (
                        <span className="text-[#22C55E] font-semibold">0 newly affected packages</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Structural Topology Shifts */}
                <div className="bg-slate-50 dark:bg-[#111C2E] p-4 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#64748B] flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-sky-500" />
                    <span>Topology Shifts</span>
                  </span>
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-[#F1F5F9]">
                      {simulationResult.diff.added_nodes.length > 0 && `+${simulationResult.diff.added_nodes.length} `}
                      {simulationResult.diff.removed_nodes.length > 0 && `-${simulationResult.diff.removed_nodes.length} `}
                      {Object.keys(simulationResult.diff.version_changes || {}).length > 0 && `~${Object.keys(simulationResult.diff.version_changes).length} ver`}
                      {simulationResult.diff.added_nodes.length === 0 && simulationResult.diff.removed_nodes.length === 0 && Object.keys(simulationResult.diff.version_changes || {}).length === 0 && 'Edges only'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                      {simulationResult.diff.added_edges.length} edge(s) added &bull; {simulationResult.diff.removed_edges.length} edge(s) removed
                    </div>
                  </div>
                </div>
              </div>

              {/* Package-Level Changes Table */}
              <div className="space-y-3 pt-2">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">
                  Package-Level Mutations & Version Changes
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 dark:border-[#26364D] rounded-xl overflow-hidden">
                    <thead className="bg-slate-100 dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3.5">Package</th>
                        <th className="py-2.5 px-3.5">Change Type</th>
                        <th className="py-2.5 px-3.5">Baseline State</th>
                        <th className="py-2.5 px-3.5">Simulated State</th>
                        <th className="py-2.5 px-3.5">Downstream Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#26364D] font-mono">
                      {/* Added Nodes */}
                      {simulationResult.diff.added_nodes.map(pkg => (
                        <tr key={pkg} className="bg-emerald-50/50 dark:bg-[#22C55E]/5">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-[#F1F5F9]">{pkg}</td>
                          <td className="py-2.5 px-3.5 text-[#22C55E] font-bold">+ Added Node</td>
                          <td className="py-2.5 px-3.5 text-slate-400">Nonexistent</td>
                          <td className="py-2.5 px-3.5 text-[#22C55E] font-semibold">Introduced</td>
                          <td className="py-2.5 px-3.5 text-slate-500 dark:text-[#94A3B8]">Incoming dependency link</td>
                        </tr>
                      ))}
                      {/* Removed Nodes */}
                      {simulationResult.diff.removed_nodes.map(pkg => (
                        <tr key={pkg} className="bg-rose-50/50 dark:bg-[#F05252]/5">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-[#F1F5F9]">{pkg}</td>
                          <td className="py-2.5 px-3.5 text-[#F05252] font-bold">- Removed Node</td>
                          <td className="py-2.5 px-3.5 text-slate-700 dark:text-[#F1F5F9]">In Graph</td>
                          <td className="py-2.5 px-3.5 text-[#F05252] font-semibold">Pruned / Unreachable</td>
                          <td className="py-2.5 px-3.5 text-slate-500 dark:text-[#94A3B8]">Incoming links severed</td>
                        </tr>
                      ))}
                      {/* Version Changes */}
                      {Object.entries(simulationResult.diff.version_changes || {}).map(([pkg, change]) => (
                        <tr key={pkg} className="bg-sky-50/50 dark:bg-[#4C8DCE]/5">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-[#F1F5F9]">{pkg}</td>
                          <td className="py-2.5 px-3.5 text-[#4C8DCE] font-bold">~ Version Upgrade</td>
                          <td className="py-2.5 px-3.5 text-slate-700 dark:text-[#F1F5F9]">v{change.original_version || 'unknown'}</td>
                          <td className="py-2.5 px-3.5 text-[#4C8DCE] font-semibold">v{change.simulated_version}</td>
                          <td className="py-2.5 px-3.5 text-slate-500 dark:text-[#94A3B8]">
                            Affects {simulationResult.impact_diff.simulated_affected_count} downstream packages
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visual Simulation Graph Stage */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-4 transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-[#26364D] pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20">
              <Network className="w-5 h-5 text-[#19B6A4]" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9]">
                {isSimulatedActive ? 'Simulated Graph with Before-and-After Change Diff Overlays' : 'Current Baseline Dependency Graph'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">
                {isSimulatedActive ? 'Visualizing mutated topology & version changes' : 'Unchanged baseline state'}
              </p>
            </div>
          </div>
          <div className="text-sm font-mono text-slate-600 dark:text-[#94A3B8] bg-slate-100 dark:bg-[#111C2E] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
            {displayNodes.length} nodes &bull; {displayEdges.length} edges
          </div>
        </div>

        {isSimulatedActive && (
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-[13px] bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
            <span className="text-slate-500 dark:text-[#94A3B8] font-bold uppercase tracking-wider text-xs">Comparison Diff Semantics:</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]"></span>
              <span className="text-[#22C55E] font-semibold">+ Added (Green)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F05252]"></span>
              <span className="text-[#F05252] font-semibold">- Removed (Red)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4C8DCE]"></span>
              <span className="text-[#4C8DCE] font-semibold">~ Modified Version (Steel Blue)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#F05252] bg-transparent"></span>
              <span className="text-[#F05252] font-semibold">Vulnerable Package (Critical Red Border)</span>
            </div>
          </div>
        )}

        <DependencyGraph
          nodes={displayNodes}
          edges={displayEdges}
          onSelectNode={setSelectedNode}
          selectedNode={selectedNode}
          diff={simulationResult?.diff}
          isSimulated={isSimulatedActive}
          securityResult={securityResult}
        />

        {/* Non-destructive Isolation Notice */}
        <div className="bg-slate-50 dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-xl p-4 text-sm text-slate-600 dark:text-[#94A3B8] flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-[#19B6A4] shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold text-slate-800 dark:text-[#F1F5F9]">Non-Destructive In-Memory Isolation:</span> What-If simulations calculate topological cycles, component connectivity, and BFS blast-radius deltas completely in memory. Baseline PostgreSQL records and immutable historical snapshots remain protected and unmodified.
          </div>
        </div>
      </div>
    </div>
  );
}
