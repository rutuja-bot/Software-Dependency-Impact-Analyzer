import React from 'react';
import { 
  Sparkles, 
  RotateCcw, 
  Network, 
  AlertTriangle, 
  CheckCircle, 
  Layers, 
  ArrowRight,
  GitPullRequest
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import SimulationPanel from '../components/SimulationPanel';
import DependencyGraph from '../components/DependencyGraph';

export default function SimulationPage() {
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
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
        <Sparkles className="w-10 h-10 mx-auto text-slate-500" />
        <h3 className="text-base font-semibold text-slate-200">No Baseline Graph Available</h3>
        <p className="text-xs max-w-md mx-auto">
          Please analyze a project manifest or load a historical snapshot before running What-If dependency modification simulations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                In-Memory "What-If" Dependency Change Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Non-destructive dependency modification preview: add, upgrade, or remove packages to evaluate graph impact
              </p>
            </div>
          </div>

          {isSimulatedActive && (
            <button
              onClick={handleResetSimulation}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
              <span>Reset to Baseline</span>
            </button>
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
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg">
              <Network className="w-4 h-4 text-teal-400" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {isSimulatedActive ? 'Simulated Graph with Change Diff Overlays' : 'Current Baseline Dependency Graph'}
            </h3>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {displayNodes.length} nodes &bull; {displayEdges.length} edges
          </div>
        </div>

        {/* Legend for Simulation Diffs */}
        {isSimulatedActive && (
          <div className="flex flex-wrap items-center gap-4 text-[11px] bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
            <span className="text-slate-400 font-semibold">Diff Legend:</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300">Added Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-rose-300">Removed Node</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span className="text-amber-300">Orphaned Package</span>
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
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-400 flex items-center space-x-2.5">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            <strong>Non-Destructive In-Memory Simulation:</strong> What-If simulations calculate topological, cycle, and structural differences in-memory without altering PostgreSQL records. Security findings and LibYear freshness remain tied to the baseline analysis ({analysisResult?.project_name}).
          </span>
        </div>
      </div>
    </div>
  );
}
