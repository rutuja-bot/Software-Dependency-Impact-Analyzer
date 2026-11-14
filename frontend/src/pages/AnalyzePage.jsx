import React from 'react';
import {
  FileJson,
  Network,
  Activity,
  CheckCircle,
  GitCommit,
  Layers,
  ArrowRight,
  Workflow
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ProjectUploader from '../components/ProjectUploader';
import DependencyGraph from '../components/DependencyGraph';
import NodeInspector from '../components/NodeInspector';
import { motion, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function AnalyzePage() {
  const shouldReduceMotion = useReducedMotion();
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
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20 shadow-glow-sm">
            <FileJson className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Analyze Dependencies
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Submit <code className="text-cyan-700 dark:text-cyan-400 font-mono">package.json</code> and optional lockfile to construct the dependency graph
            </p>
          </div>
        </div>
      </div>

      {/* Manifest Uploader */}
      <ProjectUploader onAnalyze={handleAnalyze} isLoading={isLoading} />

      {/* Analysis Results Display */}
      {analysisResult && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: easeSoft }}
          className="space-y-6 pt-2"
        >
          {/* Graph Visualization and Node Inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Cytoscape Graph (2 Cols) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                  <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  <span>Dependency Graph</span>
                </h3>
                <span className="text-sm font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900/80 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Node Inspector</span>
                </h3>
              </div>

              <NodeInspector
                selectedNode={selectedNode}
                nodes={displayNodes}
              />

              {/* Topological Sorting Card (if DAG) */}
              {displayTopological && displayTopological.length > 0 && (
                <div className="bg-white dark:bg-[#0f1422] border border-emerald-500/30 rounded-2xl p-5 space-y-3 shadow-2xs dark:shadow-card">
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Valid Topological Evaluation Order (DAG)</span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Graph contains zero cycles. Valid compilation and installation build sequence computed via Kahn's algorithm:
                  </p>
                  <div className="text-xs sm:text-[13px] font-mono text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto space-y-1 bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200 dark:border-white/[0.04]">
                    {displayTopological.map((pkg, idx) => (
                      <div key={pkg} className="flex items-center justify-between text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 py-0.5">
                        <span className="flex items-center space-x-2">
                          <span className="text-slate-400 dark:text-slate-600 text-xs w-5">{idx + 1}.</span>
                          <span className={pkg === analysisResult.project_name ? 'text-cyan-700 dark:text-cyan-400 font-bold' : 'text-slate-800 dark:text-slate-300'}>{pkg}</span>
                        </span>
                        {pkg === analysisResult.project_name && (
                          <span className="text-[10px] bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-400 px-1.5 py-0.2 rounded border border-cyan-300 dark:border-cyan-800/40">ROOT</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
