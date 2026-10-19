import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GitCommit, 
  Sparkles, 
  Network, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  ArrowRight,
  Database,
  Layers,
  FileJson
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import SummaryCards from '../components/SummaryCards';
import DependencyGraph from '../components/DependencyGraph';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { 
    analysisResult, 
    simulationResult, 
    securityResult, 
    isSimulatedActive, 
    displayNodes, 
    displayEdges, 
    displayStats, 
    displayCycles, 
    selectedNode, 
    setSelectedNode 
  } = useAnalysis();

  if (!analysisResult) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-8 text-center max-w-2xl mx-auto space-y-4 shadow-lg">
          <div className="inline-flex p-3 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
            <Network className="w-10 h-10 text-teal-400" />
          </div>
          <h2 className="text-xl font-bold text-white">No Dependency Analysis Loaded</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Begin by analyzing a software project manifest (`package.json` / lockfile) or load an immutable graph snapshot from historical PostgreSQL persistence.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <button
              onClick={() => navigate('/analyze')}
              className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold px-4 py-2.5 rounded-lg text-xs shadow transition"
            >
              <FileJson className="w-4 h-4" />
              <span>Analyze Project Manifest</span>
            </button>
            <button
              onClick={() => navigate('/history')}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold px-4 py-2.5 rounded-lg text-xs shadow transition"
            >
              <Database className="w-4 h-4" />
              <span>Browse Historical Snapshots</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Overview Bar */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <GitCommit className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Inspected Project</div>
            <div className="text-lg font-bold text-white font-mono">
              {analysisResult.project_name}{' '}
              <span className="text-xs text-teal-400 font-sans font-normal">v{analysisResult.project_version}</span>
            </div>
          </div>
        </div>

        {/* View Mode Indicator */}
        <div className="flex items-center space-x-2">
          {isSimulatedActive ? (
            <div className="flex items-center space-x-1.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mode: Simulated What-If Preview</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs text-slate-300 font-medium">
              <span>Mode: Unchanged Baseline</span>
            </div>
          )}
          <div className="text-xs bg-slate-900 border border-slate-700/80 px-3 py-1.5 rounded-lg text-slate-300 font-mono">
            Convention: <span className="text-teal-400 font-semibold">A &rarr; B</span> (A depends on B)
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <SummaryCards stats={displayStats} />

      {/* Circular Dependency Warning Banner */}
      {displayStats?.has_cycles && (
        <div className="bg-rose-950/40 border border-rose-700/60 rounded-xl p-4 space-y-2">
          <div className="flex items-center space-x-2 text-rose-300 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Circular Dependency Detected ({displayStats.cycle_count} cycle loop(s))</span>
          </div>
          <div className="space-y-1">
            {displayCycles.map((cyc, idx) => (
              <div key={idx} className="text-xs font-mono bg-rose-900/30 px-2.5 py-1.5 rounded border border-rose-800/40 text-rose-200">
                Loop #{idx + 1}: {cyc.cycle_path ? cyc.cycle_path.join(' → ') : JSON.stringify(cyc)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependency Graph Container */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg">
              <Network className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                {isSimulatedActive ? 'Simulated Graph with Change Diff Overlays' : 'Interactive Directed Dependency Graph'}
              </h2>
              <p className="text-xs text-slate-400">
                {displayNodes.length} graph nodes (1 root project + {displayStats?.total_packages ?? (displayNodes.length - 1)} dependencies) &bull; {displayEdges.length} edges &bull; Click node to inspect properties
              </p>
            </div>
          </div>

          {/* Quick jump to Inspector */}
          {selectedNode && (
            <button
              onClick={() => navigate('/inspector')}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition"
            >
              <span>Inspect "{selectedNode}"</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <DependencyGraph 
          nodes={displayNodes}
          edges={displayEdges}
          onSelectNode={setSelectedNode}
          selectedNode={selectedNode}
          diff={simulationResult?.diff}
          isSimulated={isSimulatedActive}
          securityResult={securityResult}
        />
      </div>

      {/* Quick Action Navigation Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => navigate('/security')}
          className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-4 cursor-pointer transition space-y-2 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition" />
          </div>
          <div className="font-bold text-white text-sm">Security Vulnerability Scan</div>
          <p className="text-xs text-slate-400">
            Check packages against the OSV vulnerability database for known advisories and CVEs.
          </p>
        </div>

        <div 
          onClick={() => navigate('/freshness')}
          className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-4 cursor-pointer transition space-y-2 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition" />
          </div>
          <div className="font-bold text-white text-sm">LibYear Freshness Analysis</div>
          <p className="text-xs text-slate-400">
            Compute dependency lag and measure release date differences for out-of-date packages.
          </p>
        </div>

        <div 
          onClick={() => navigate('/simulation')}
          className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-4 cursor-pointer transition space-y-2 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
          </div>
          <div className="font-bold text-white text-sm">What-If Change Simulation</div>
          <p className="text-xs text-slate-400">
            Simulate adding, upgrading, or removing packages in-memory to evaluate downstream impacts.
          </p>
        </div>
      </div>
    </div>
  );
}
