import React from 'react';
import { 
  FileJson, 
  Network, 
  Activity, 
  CheckCircle, 
  GitCommit, 
  Layers 
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ProjectUploader from '../components/ProjectUploader';
import DependencyGraph from '../components/DependencyGraph';
import NodeInspector from '../components/NodeInspector';

export default function AnalyzePage() {
  const { 
    handleAnalyze, 
    isLoading, 
    analysisResult, 
    displayNodes, 
    displayEdges, 
    displayTopological,
    selectedNode, 
    setSelectedNode,
    securityResult,
    simulationResult,
    isSimulatedActive
  } = useAnalysis();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg">
            <FileJson className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Analyze Project Manifest & Generate Directed Dependency Graph
            </h2>
            <p className="text-xs text-slate-400">
              Input `package.json` and optional lockfile to build the full directed dependency graph
            </p>
          </div>
        </div>
      </div>

      {/* Manifest Uploader */}
      <ProjectUploader onAnalyze={handleAnalyze} isLoading={isLoading} />

      {/* Analysis Results Display */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Inspected Project Summary Header */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <GitCommit className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Current Analyzed Manifest</div>
                <div className="text-base font-bold text-white font-mono">
                  {analysisResult.project_name} <span className="text-xs text-teal-400 font-sans font-normal">v{analysisResult.project_version}</span>
                </div>
              </div>
            </div>
            <div className="text-xs font-mono bg-slate-900 border border-slate-700/80 px-3 py-1.5 rounded-lg text-slate-300">
              Convention: <span className="text-teal-400 font-semibold">A &rarr; B</span> (A depends on B)
            </div>
          </div>

          {/* Graph Visualization and Node Inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cytoscape Graph (2 Cols) */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <Network className="w-4 h-4 text-teal-400" />
                  <span>Interactive Directed Dependency Graph</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {displayNodes.length} nodes &bull; {displayEdges.length} edges
                </span>
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

            {/* Node Inspector Panel (1 Col) */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>Package & Blast Radius Inspector</span>
              </h3>
              <NodeInspector 
                selectedNode={selectedNode}
                nodes={displayNodes}
              />

              {/* Topological Sorting Card (if DAG) */}
              {displayTopological && displayTopological.length > 0 && (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-2 mt-4">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Valid Topological Evaluation Order (DAG)</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto space-y-0.5">
                    {displayTopological.map((pkg, idx) => (
                      <div key={pkg} className="text-slate-400">
                        <span className="text-slate-500 mr-1.5">{idx + 1}.</span>
                        <span className={pkg === analysisResult.project_name ? 'text-teal-400 font-bold' : ''}>{pkg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
