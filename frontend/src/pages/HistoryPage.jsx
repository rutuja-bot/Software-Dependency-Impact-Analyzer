import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  History,
  ArrowRight,
  CheckCircle2,
  Layers,
  GitCommit
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ProjectHistoryPanel from '../components/ProjectHistoryPanel';
import { motion, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function HistoryPage() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const {
    handleLoadSnapshot,
    analysisResult,
    currentAnalysisId
  } = useAnalysis();

  const handleSnapshotRestored = async (detail) => {
    await handleLoadSnapshot(detail);
  };

  return (
    <div className="space-y-6">
      {/* Active Loaded Snapshot Notice if present */}
      {analysisResult && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: easeSoft }}
          className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs dark:shadow-card transition-colors duration-200"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">Currently Hydrated Graph Snapshot</div>
              <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-mono flex items-center space-x-2 mt-0.5">
                <span>{analysisResult.project_name}</span>
                <span className="text-xs sm:text-[13px] text-cyan-700 dark:text-cyan-400 font-sans font-normal bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                  v{analysisResult.project_version}
                </span>
                {currentAnalysisId && (
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#070b14] px-2 py-0.5 rounded border border-slate-200 dark:border-white/[0.06]">
                    ID: {currentAnalysisId.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <motion.button
            onClick={() => navigate('/overview')}
            whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
            className="flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white text-sm font-semibold px-4.5 py-2.5 rounded-xl shadow-glow-sm transition duration-150"
          >
            <span>View Active Graph</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      )}

      {/* Main History Panel */}
      <ProjectHistoryPanel
        onLoadSnapshot={handleSnapshotRestored}
        currentProjectName={analysisResult?.project_name}
      />
    </div>
  );
}
