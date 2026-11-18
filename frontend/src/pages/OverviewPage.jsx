import React, { useState, useEffect } from 'react';
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
  Workflow,
  Flame,
  ShieldCheck,
  GitFork
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import SummaryCards from '../components/SummaryCards';
import DependencyGraph from '../components/DependencyGraph';
import NodeInspector from '../components/NodeInspector';
import { getProjectRisk } from '../services/api';
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
    setSelectedNode,
    highlightedImpact
  } = useAnalysis();

  const [projectRisk, setProjectRisk] = useState(null);

  useEffect(() => {
    if (analysisResult) {
      getProjectRisk(analysisResult.analysis_id)
        .then(res => setProjectRisk(res))
        .catch(() => {});
    }
  }, [analysisResult]);

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
          className="relative overflow-hidden bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-3xl p-6 sm:p-12 text-center max-w-3xl mx-auto shadow-sm dark:shadow-card space-y-6"
        >
          <div className="inline-flex p-4 bg-[#19B6A4]/10 text-[#19B6A4] rounded-2xl border border-[#19B6A4]/30 shadow-glow-sm">
            <Network className="w-10 h-10 text-[#19B6A4]" />
          </div>

          <div className="space-y-2.5 max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
              Software Dependency Impact Analyzer
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-[#94A3B8] leading-relaxed">
              Analyze software project manifests (<code className="text-[#19B6A4] font-mono">package.json</code> & lockfiles), visualize direct and transitive dependencies, detect circular loops, simulate upstream version changes, and evaluate security vulnerabilities.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            <motion.button
              onClick={() => navigate('/analyze')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] text-[#0B1220] font-bold px-5 py-3 rounded-xl text-sm shadow-glow-teal transition duration-200"
            >
              <FileJson className="w-4 h-4" />
              <span>Analyze Manifest or Lockfile</span>
            </motion.button>
            <motion.button
              onClick={() => navigate('/history')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-[#111C2E] dark:hover:bg-[#1c2c44] border border-slate-300 dark:border-[#26364D] dark:text-[#F1F5F9] font-semibold px-5 py-3 rounded-xl text-sm shadow-2xs transition duration-200"
            >
              <Database className="w-4 h-4 text-[#4C8DCE]" />
              <span>Browse Saved Snapshots</span>
            </motion.button>
          </div>

          {/* Quick feature highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-6 border-t border-slate-200 dark:border-[#26364D] text-left">
            <div className="p-3.5 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-[#26364D]">
              <div className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                <Workflow className="w-4 h-4 text-[#19B6A4]" />
                <span>Directed Graphs</span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">A &rarr; B dependency graphs with Kahn topological evaluation.</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-[#26364D]">
              <div className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-[#4C8DCE]" />
                <span>What-If Simulations</span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">Preview impact of adding, upgrading, or removing packages in-memory.</p>
            </div>
            <div className="p-3.5 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-[#26364D]">
              <div className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-[#F05252]" />
                <span>OSV Intelligence</span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">Direct query matching against Google's Open Source Vulnerabilities.</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Banner & Mode Switcher */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/25">
            <GitCommit className="w-6 h-6 text-[#19B6A4]" />
          </div>
          <div>
            <div className="text-xs sm:text-[13px] uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] font-bold">
              Active Project
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] font-mono flex items-center space-x-2.5 mt-0.5">
              <span>{analysisResult.project_name}</span>
              <span className="text-sm text-[#19B6A4] font-sans font-medium bg-slate-100 dark:bg-[#111C2E] px-2.5 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
                v{analysisResult.project_version}
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Badge */}
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          {isSimulatedActive ? (
            <div className="flex items-center space-x-2 bg-[#4C8DCE]/15 text-[#4C8DCE] border border-[#4C8DCE]/40 px-3.5 py-1.5 rounded-xl text-sm font-semibold shadow-2xs animate-pulse">
              <Sparkles className="w-4 h-4 text-[#4C8DCE]" />
              <span>Simulated What-If Preview</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] px-3 py-1.5 rounded-xl text-sm text-slate-700 dark:text-[#94A3B8] font-medium">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]"></span>
              <span>Baseline Graph</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <SummaryCards stats={displayStats} />

      {/* Project Risk Score Banner */}
      {projectRisk && (
        <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-5 shadow-2xs dark:shadow-card flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className={`p-3 rounded-xl border ${
              projectRisk.overall_category === 'critical' ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30' :
              projectRisk.overall_category === 'high' ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30' :
              projectRisk.overall_category === 'moderate' ? 'bg-[#4C8DCE]/10 text-[#4C8DCE] border-[#4C8DCE]/30' :
              'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
            }`}>
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] font-bold">
                Project Dependency Risk Score
              </div>
              <div className="flex items-center space-x-2.5 mt-0.5">
                <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-[#F1F5F9]">
                  {projectRisk.overall_score} / 100
                </span>
                <span className={`text-xs uppercase font-bold font-mono px-2.5 py-0.5 rounded-full border ${
                  projectRisk.overall_category === 'critical' ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30' :
                  projectRisk.overall_category === 'high' ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30' :
                  projectRisk.overall_category === 'moderate' ? 'bg-[#4C8DCE]/10 text-[#4C8DCE] border-[#4C8DCE]/30' :
                  'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
                }`}>
                  {projectRisk.overall_category} Risk
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-50 dark:bg-[#111C2E] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#26364D]">
              <span className="text-slate-400 dark:text-[#64748B]">Critical Packages:</span>{' '}
              <span className="font-bold text-[#F05252] font-mono">{projectRisk.critical_risk_packages_count}</span>
            </div>
            <div className="bg-slate-50 dark:bg-[#111C2E] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#26364D]">
              <span className="text-slate-400 dark:text-[#64748B]">High Risk:</span>{' '}
              <span className="font-bold text-[#F59E0B] font-mono">{projectRisk.high_risk_packages_count}</span>
            </div>
            <div className="bg-slate-50 dark:bg-[#111C2E] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#26364D]">
              <span className="text-slate-400 dark:text-[#64748B]">Evaluated:</span>{' '}
              <span className="font-bold text-[#19B6A4] font-mono">{projectRisk.total_packages_evaluated} pkgs</span>
            </div>
          </div>
        </div>
      )}

      {/* Circular Dependency Warning Banner */}
      {displayStats?.has_cycles && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 dark:bg-[#F05252]/10 border border-rose-300 dark:border-[#F05252]/30 rounded-2xl p-5 space-y-3 shadow-2xs dark:shadow-card"
        >
          <div className="flex items-center space-x-2.5 text-[#F05252] font-bold text-base sm:text-lg">
            <AlertTriangle className="w-5 h-5 text-[#F05252] shrink-0" />
            <span>Circular Dependency Detected ({displayStats.cycle_count} cycle loop(s))</span>
          </div>
          <p className="text-sm text-rose-600 dark:text-[#94A3B8] leading-relaxed">
            Cyclic dependencies prevent topological ordering and increase risk of runtime initialization failures. The following feedback loops were detected:
          </p>
          <div className="space-y-1.5">
            {displayCycles.map((cyc, idx) => (
              <div key={idx} className="text-sm font-mono bg-white dark:bg-[#172438] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-[#F05252]/30 text-rose-800 dark:text-[#F05252] flex items-center space-x-2">
                <span className="text-[#F05252] font-bold">Loop #{idx + 1}:</span>
                <span className="font-semibold">{cyc.cycle_path ? cyc.cycle_path.join(' → ') : JSON.stringify(cyc)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Dependency Graph Container with Inline Node Inspector */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#26364D] pb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20">
              <Network className="w-5 h-5 text-[#19B6A4]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-wide flex items-center space-x-2">
                <span>{isSimulatedActive ? 'Simulated Dependency Graph' : 'Interactive Dependency Graph'}</span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-0.5">
                {displayNodes.length} nodes &bull; {displayEdges.length} edges &bull; Click any package to inspect downstream impact and risk
              </p>
            </div>
          </div>

          {selectedNode && (
            <motion.button
              onClick={() => navigate('/inspector')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              className="flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] text-[#0B1220] text-sm font-bold px-4 py-2 rounded-xl shadow-glow-teal transition"
            >
              <Activity className="w-4 h-4" />
              <span>Full Screen Inspector</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className={selectedNode ? "lg:col-span-2" : "lg:col-span-3"}>
            <DependencyGraph
              nodes={displayNodes}
              edges={displayEdges}
              onSelectNode={setSelectedNode}
              selectedNode={selectedNode}
              diff={simulationResult?.diff}
              isSimulated={isSimulatedActive}
              securityResult={securityResult}
              highlightedImpact={highlightedImpact}
            />
          </div>
          {selectedNode && (
            <div className="lg:col-span-1">
              <NodeInspector
                selectedNode={selectedNode}
                nodes={displayNodes}
                onSelectAnother={setSelectedNode}
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Navigation Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">

        {/* Security Card */}
        <motion.div
          onClick={() => navigate('/security')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#F05252]/50 rounded-2xl p-5 sm:p-6 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-[#F05252]/10 text-[#F05252] rounded-xl border border-[#F05252]/20 group-hover:scale-105 transition-transform duration-200">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F05252] group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-[#F1F5F9] text-base sm:text-[17px] group-hover:text-[#F05252] transition duration-150">
              Security Vulnerability Scan
            </div>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
              Verify package hashes against Google's OSV database for known advisories and CVEs.
            </p>
          </div>
          <div className="text-xs sm:text-[13px] font-mono text-slate-500 dark:text-[#94A3B8] pt-2 border-t border-slate-100 dark:border-[#26364D] flex items-center justify-between">
            <span>Status:</span>
            <span className={securityResult?.vulnerable_packages_count > 0 ? 'text-[#F05252] font-semibold' : 'text-[#22C55E] font-semibold'}>
              {securityResult ? (securityResult.vulnerable_packages_count > 0 ? `${securityResult.vulnerable_packages_count} Vuln Packages` : 'Clean') : 'Scan Ready'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-[#F05252]/10 rounded-full blur-xl pointer-events-none group-hover:bg-[#F05252]/15 transition-all duration-300"></div>
        </motion.div>

        {/* Freshness Card */}
        <motion.div
          onClick={() => navigate('/freshness')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#4C8DCE]/50 rounded-2xl p-5 sm:p-6 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-[#4C8DCE]/10 text-[#4C8DCE] rounded-xl border border-[#4C8DCE]/20 group-hover:scale-105 transition-transform duration-200">
              <Clock className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#4C8DCE] group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-[#F1F5F9] text-base sm:text-[17px] group-hover:text-[#4C8DCE] transition duration-150">
              LibYear Freshness Analysis
            </div>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
              Measure release date differences and compute out-of-date technical lag in years.
            </p>
          </div>
          <div className="text-xs sm:text-[13px] font-mono text-slate-500 dark:text-[#94A3B8] pt-2 border-t border-slate-100 dark:border-[#26364D] flex items-center justify-between">
            <span>Lag Metric:</span>
            <span className="text-[#4C8DCE] font-semibold">
              {freshnessResult?.project_total_libyear ? `${Number(freshnessResult.project_total_libyear).toFixed(1)} LibYears` : 'Ready to Analyze'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-[#4C8DCE]/10 rounded-full blur-xl pointer-events-none group-hover:bg-[#4C8DCE]/15 transition-all duration-300"></div>
        </motion.div>

        {/* Simulation Card */}
        <motion.div
          onClick={() => navigate('/simulation')}
          whileHover={cardHover}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#19B6A4]/50 rounded-2xl p-5 sm:p-6 cursor-pointer transition-colors duration-200 shadow-2xs dark:shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 group-hover:scale-105 transition-transform duration-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#19B6A4] group-hover:translate-x-1 transition-transform duration-200" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-[#F1F5F9] text-base sm:text-[17px] group-hover:text-[#19B6A4] transition duration-150">
              What-If Change Simulation
            </div>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
              Simulate adding, upgrading, or removing packages in-memory to evaluate downstream blast radius.
            </p>
          </div>
          <div className="text-xs sm:text-[13px] font-mono text-slate-500 dark:text-[#94A3B8] pt-2 border-t border-slate-100 dark:border-[#26364D] flex items-center justify-between">
            <span>Simulation:</span>
            <span className="text-[#19B6A4] font-semibold">
              {isSimulatedActive ? 'Active Preview' : 'Interactive Playground'}
            </span>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-[#19B6A4]/10 rounded-full blur-xl pointer-events-none group-hover:bg-[#19B6A4]/15 transition-all duration-300"></div>
        </motion.div>
      </div>
    </div>
  );
}
