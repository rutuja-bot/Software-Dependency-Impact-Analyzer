import React from 'react';
import {
  Sparkles,
  RotateCcw,
  Network,
  AlertTriangle,
  CheckCircle,
  Layers,
  ArrowRight,
  GitPullRequest,
  ShieldCheck
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
    isSimulatedActive,
    handleSimulationSuccess,
    handleResetSimulation,
    displayNodes,
    displayEdges,
    selectedNode,
    setSelectedNode,
    securityResult
  } = useAnalysis();

  if (!analysisResult) {
    return (
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-10 text-center text-slate-500 dark:text-slate-400 space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl w-fit mx-auto border border-indigo-500/20">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Baseline Graph Available</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Please analyze a project manifest or load a historical snapshot before running What-If dependency modification simulations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 shadow-sm">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                What-If Change Simulator
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Simulate adding, upgrading, or removing packages in-memory to evaluate impact
              </p>
            </div>
          </div>

          {isSimulatedActive && (
            <motion.button
              onClick={handleResetSimulation}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700/90 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold px-4.5 py-2.5 rounded-xl transition shadow-2xs duration-150"
            >
              <RotateCcw className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Reset to Baseline Graph</span>
            </motion.button>
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

      {/* Visual Simulation Graph Stage */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card space-y-4 transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-white/[0.06] pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20">
              <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {isSimulatedActive ? 'Simulated Graph with Change Diff Overlays' : 'Current Baseline Dependency Graph'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {isSimulatedActive ? 'Previewing simulated topology delta' : 'Unchanged baseline state'}
              </p>
            </div>
          </div>
          <div className="text-sm font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
            {displayNodes.length} nodes &bull; {displayEdges.length} edges
          </div>
        </div>

        {isSimulatedActive && (
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-[13px] bg-slate-50 dark:bg-[#070b14] p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.06]">
            <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">Diff Indicators:</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-glow-emerald"></span>
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">+ Added Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-glow-rose"></span>
              <span className="text-rose-700 dark:text-rose-300 font-semibold">- Removed Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">~ Orphaned Package</span>
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
        <div className="bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4 text-sm text-slate-600 dark:text-slate-400 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold text-slate-800 dark:text-slate-200">Non-Destructive In-Memory Isolation:</span> What-If simulations calculate topological cycles, component connectivity, and BFS blast-radius deltas completely in memory. Baseline PostgreSQL records and immutable historical snapshots remain protected and unmodified.
          </div>
        </div>
      </div>
    </div>
  );
}
