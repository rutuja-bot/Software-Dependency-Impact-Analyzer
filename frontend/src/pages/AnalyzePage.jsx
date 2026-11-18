import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileJson,
  Network,
  Activity,
  CheckCircle,
  GitCommit,
  Layers,
  ArrowRight,
  Workflow,
  Flame,
  Sparkles,
  Database
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ProjectUploader from '../components/ProjectUploader';
import DependencyGraph from '../components/DependencyGraph';
import NodeInspector from '../components/NodeInspector';
import { motion, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function AnalyzePage() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const {
    handleAnalyze,
    handleImportSuccess,
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
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-glow-sm">
            <FileJson className="w-6 h-6 text-[#19B6A4]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
              Project Analyzer & Ingestion Hub
            </h2>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
              Import repositories from GitHub, local folders, ZIP archives, or raw manifests to construct directed dependency graphs
            </p>
          </div>
        </div>
      </div>

      {/* Manifest Uploader */}
      <ProjectUploader
        onAnalyze={handleAnalyze}
        onImportSuccess={handleImportSuccess}
        isLoading={isLoading}
      />

      {/* Analysis Results Display */}
      {analysisResult && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: easeSoft }}
          className="space-y-6 pt-2"
        >
          {/* Quick Action Navigation Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => navigate('/explorer')}
              className="flex items-center justify-between p-3.5 bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] hover:border-[#19B6A4]/40 rounded-xl transition group text-left shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-[#19B6A4]/10 text-[#19B6A4]">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-[#F1F5F9]">Deep Impact Explorer</div>
                  <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Blast radius, blast trees, reachability</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#19B6A4] transition-transform group-hover:translate-x-1" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/risk')}
              className="flex items-center justify-between p-3.5 bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] hover:border-[#4C8DCE]/40 rounded-xl transition group text-left shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-[#4C8DCE]/10 text-[#4C8DCE]">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-[#F1F5F9]">4-Factor Risk Evaluation</div>
                  <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">OSV vulnerabilities, LibYear, topology</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#4C8DCE] transition-transform group-hover:translate-x-1" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/simulation')}
              className="flex items-center justify-between p-3.5 bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] hover:border-[#19B6A4]/40 rounded-xl transition group text-left shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-[#19B6A4]/10 text-[#19B6A4]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-[#F1F5F9]">What-If Simulation</div>
                  <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Add, upgrade, remove comparisons</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#19B6A4] transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Graph Visualization and Node Inspector Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Cytoscape Graph (2 Cols) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2">
                  <Network className="w-5 h-5 text-[#19B6A4]" />
                  <span>Dependency Graph</span>
                </h3>
                <span className="text-sm font-mono text-slate-600 dark:text-[#94A3B8] bg-white dark:bg-[#111C2E] px-3 py-1 rounded-xl border border-slate-200 dark:border-[#26364D] shadow-2xs">
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
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-[#4C8DCE]" />
                  <span>Node Inspector</span>
                </h3>
              </div>

              <NodeInspector
                selectedNode={selectedNode}
                nodes={displayNodes}
              />

              {/* Topological Sorting Card (if DAG) */}
              {displayTopological && displayTopological.length > 0 && (
                <div className="bg-white dark:bg-[#172438] border border-[#22C55E]/30 rounded-2xl p-5 space-y-3 shadow-2xs dark:shadow-card">
                  <div className="text-sm font-bold text-[#22C55E] flex items-center space-x-1.5">
                    <CheckCircle className="w-4 h-4 text-[#22C55E]" />
                    <span>Valid Topological Evaluation Order (DAG)</span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] leading-relaxed">
                    Graph contains zero cycles. Valid compilation and installation build sequence computed via Kahn's algorithm:
                  </p>
                  <div className="text-xs sm:text-[13px] font-mono text-slate-700 dark:text-[#94A3B8] max-h-40 overflow-y-auto space-y-1 bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200 dark:border-[#26364D]">
                    {displayTopological.map((pkg, idx) => (
                      <div key={pkg} className="flex items-center justify-between text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white py-0.5">
                        <span className="flex items-center space-x-2">
                          <span className="text-slate-400 dark:text-[#64748B] text-xs w-5">{idx + 1}.</span>
                          <span className={pkg === analysisResult.project_name ? 'text-[#19B6A4] font-bold' : 'text-slate-800 dark:text-[#F1F5F9]'}>{pkg}</span>
                        </span>
                        {pkg === analysisResult.project_name && (
                          <span className="text-[10px] bg-[#19B6A4]/10 text-[#19B6A4] px-1.5 py-0.2 rounded border border-[#19B6A4]/30">ROOT</span>
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
