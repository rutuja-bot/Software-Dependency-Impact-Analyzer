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
  FileJson,
  Activity,
  CheckCircle2,
  Share2,
  Workflow
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import SummaryCards from '../components/SummaryCards';
import DependencyGraph from '../components/DependencyGraph';
import { motion, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function OverviewPage() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const {
    analysisResult,
    simulationResult,
    securityResult,
    freshnessResult,
    isSimulatedActive,
    displayNodes,
    displayEdges,
    displayStats,
    displayCycles,
    selectedNode,
    setSelectedNode
  } = useAnalysis();

  const cardHover = shouldReduceMotion ? {} : {
    y: -4,
    transition: { duration: 0.2, ease: easeSoft }
  };

  if (!analysisResult) {
    return (
      <div className="space-y-8 py-6">
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: easeSoft }}
          className="relative overflow-hidden bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-3xl p-8 sm:p-12 text-center max-w-3xl mx-auto shadow-sm dark:shadow-card space-y-6"
        >
          <div className="inline-flex p-4 bg-gradient-to-br from-cyan-500/20 to-teal-500/10 text-cyan-600 dark:text-cyan-400 rounded-2xl border border-cyan-500/30 shadow-glow-sm">
            <Network className="w-10 h-10 text-cyan-600 dark:text-cyan-400" />
          </div>

          <div className="space-y-2.5 max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Software Dependency Impact Analyzer
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Analyze software project manifests (<code className="text-cyan-700 dark:text-cyan-400 font-mono">package.json</code> & lockfiles), visualize direct and transitive dependencies, detect circular loops, simulate upstream version changes, and evaluate security vulnerabilities.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            <motion.button
              onClick={() => navigate('/analyze')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-semibold px-5 py-3 rounded-xl text-xs shadow-glow-sm transition duration-200"
            >
              <FileJson className="w-4 h-4" />
              <span>Analyze Manifest or Lockfile</span>
            </motion.button>
            <motion.button
              onClick={() => navigate('/history')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white font-semibold px-5 py-3 rounded-xl text-xs shadow-2xs transition duration-200"
            >
              <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Browse Saved Snapshots</span>
            </motion.button>
          </div>

          {/* Quick feature highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-6 border-t border-slate-200 dark:border-white/[0.06] text-left">
            <div className="p-3.5 bg-slate-50 dark:bg-[#090d16] rounded-xl border border-slate-200 dark:border-white/[0.05]">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Workflow className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Directed Graphs</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">A &rarr; B dependency graphs with Kahn topological evaluation.</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-[#090d16] rounded-xl border border-slate-200 dark:border-white/[0.05]">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>What-If Simulations</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Preview impact of adding, upgrading, or removing packages in-memory.</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-[#090d16] rounded-xl border border-slate-200 dark:border-white/[0.05]">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                <span>OSV Intelligence</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Direct query matching against Google's Open Source Vulnerabilities.</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Banner & Mode Switcher */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 shadow-2xs dark:shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/25">
            <GitCommit className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Active Dependency Tree</span>
              <span className="text-[10px] font-mono bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/25 px-2.5 py-0.5 rounded-full font-semibold">
                NPM Ecosystem
              </span>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white font-mono flex items-center space-x-2 mt-0.5">
              <span>{analysisResult.project_name}</span>
              <span className="text-xs text-cyan-700 dark:text-cyan-400 font-sans font-medium bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                v{analysisResult.project_version}
              </span>
            </div>
          </div>
        </div>

        {/* View Mode & Graph Notation Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isSimulatedActive ? (
            <div className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs animate-pulse">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Simulated What-If Preview</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Baseline Verified Graph</span>
            </div>
          )}

          <div className="text-xs bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/[0.08] px-3 py-1.5 rounded-xl text-slate-700 dark:text-slate-300 font-mono">
            Convention: <span className="text-cyan-700 dark:text-cyan-400 font-semibold">A &rarr; B</span> (A depends on B)
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <SummaryCards stats={displayStats} />

      {/* Circular Dependency Warning Banner */}
      {displayStats?.has_cycles && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-600/50 rounded-2xl p-5 space-y-3 shadow-2xs dark:shadow-card"
        >
          <div className="flex items-center space-x-2.5 text-rose-700 dark:text-rose-300 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0" />
            <span>Circular Dependency Detected ({displayStats.cycle_count} cycle loop(s))</span>
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-200/80 leading-relaxed">
            Cyclic dependencies prevent topological ordering and increase risk of runtime initialization failures. The following feedback loops were detected:
          </p>
          <div className="space-y-1.5">
            {displayCycles.map((cyc, idx) => (
              <div key={idx} className="text-xs font-mono bg-white dark:bg-rose-900/40 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200 flex items-center space-x-2">
                <span className="text-rose-600 dark:text-rose-400 font-bold">Loop #{idx + 1}:</span>
                <span className="font-semibold">{cyc.cycle_path ? cyc.cycle_path.join(' → ') : JSON.stringify(cyc)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Dependency Graph Container */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 shadow-2xs dark:shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.06] pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20">
              <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center space-x-2">
                <span>{isSimulatedActive ? 'Simulated Graph with Change Diff Overlays' : 'Interactive Directed Dependency Graph'}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {displayNodes.length} nodes &bull; {displayEdges.length} dependency edges &bull; Click any package node to inspect blast radius
              </p>
            </div>
          </div>

          {/* Quick jump to Inspector */}
          {selectedNode && (
            <motion.button
              onClick={() => navigate('/inspector')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs transition"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Inspect "{selectedNode}"</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">

        {/* Security Card */}
        <motion.div
          onClick={() => navigate('/security')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-rose-500/40 rounded-2xl p-5 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-xl border border-rose-500/20 group-hover:scale-105 transition-transform duration-200">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-rose-500 dark:group-hover:text-rose-400 group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-rose-600 dark:group-hover:text-rose-300 transition duration-150">
              Security Vulnerability Scan
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Verify package hashes against Google's OSV database for known advisories and CVEs.
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between">
            <span>Status:</span>
            <span className={securityResult?.vulnerable_packages_count > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
              {securityResult ? (securityResult.vulnerable_packages_count > 0 ? `${securityResult.vulnerable_packages_count} Vuln Packages` : 'Clean') : 'Scan Ready'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-rose-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-rose-500/15 transition-all duration-300"></div>
        </motion.div>

        {/* Freshness Card */}
        <motion.div
          onClick={() => navigate('/freshness')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-cyan-500/40 rounded-2xl p-5 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
              <Clock className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition duration-150">
              LibYear Freshness Analysis
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Measure release date differences and compute out-of-date technical lag in years.
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between">
            <span>Lag Metric:</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
              {freshnessResult?.project_total_libyear ? `${Number(freshnessResult.project_total_libyear).toFixed(1)} LibYears` : 'Ready to Analyze'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-300"></div>
        </motion.div>

        {/* Simulation Card */}
        <motion.div
          onClick={() => navigate('/simulation')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-indigo-500/40 rounded-2xl p-5 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition duration-150">
              What-If Change Simulation
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Simulate adding, upgrading, or removing packages in-memory to evaluate downstream blast radius.
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/[0.04] flex items-center justify-between">
            <span>Simulation:</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
              {isSimulatedActive ? 'Active Preview' : 'Interactive Playground'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-300"></div>
        </motion.div>
      </div>
    </div>
  );
}
