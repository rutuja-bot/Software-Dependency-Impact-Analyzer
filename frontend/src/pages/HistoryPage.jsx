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
          className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-3.5 sm:p-4.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs dark:shadow-card transition-colors duration-200"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#22C55E]/10 text-[#22C55E] rounded-xl border border-[#22C55E]/20">
              <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#94A3B8]">Currently Hydrated Graph Snapshot</div>
              <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] font-mono flex items-center space-x-2 mt-0.5">
                <span>{analysisResult.project_name}</span>
                <span className="text-xs sm:text-[13px] text-[#19B6A4] font-sans font-medium bg-slate-100 dark:bg-[#111C2E] px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-[#26364D]">
                  v{analysisResult.project_version}
                </span>
                {currentAnalysisId && (
                  <span className="text-xs font-mono text-slate-600 dark:text-[#94A3B8] bg-slate-100 dark:bg-[#111C2E] px-2 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
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
            className="w-full sm:w-auto justify-center flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] text-[#0B1220] text-sm font-bold px-4.5 py-2.5 rounded-xl shadow-glow-teal transition duration-150"
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
