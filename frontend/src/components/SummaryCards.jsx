import React from 'react';
import { Package, GitFork, RefreshCcw, Layers, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedCounter, easeSoft } from '../utils/animations';

export default function SummaryCards({ stats }) {
  const shouldReduceMotion = useReducedMotion();
  if (!stats) return null;

  const total = stats.total_packages || 0;
  const direct = stats.direct_dependencies_count || 0;
  const transitive = stats.transitive_dependencies_count || 0;
  const directPct = total > 0 ? ((direct / total) * 100).toFixed(0) : 0;
  const transitivePct = total > 0 ? ((transitive / total) * 100).toFixed(0) : 0;

  const cardHover = shouldReduceMotion ? {} : {
    y: -4,
    transition: { duration: 0.2, ease: easeSoft }
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: easeSoft }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5"
    >
      {/* Total Packages */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className="relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-cyan-500/40 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20 shadow-glow-sm group-hover:scale-105 transition-transform duration-200">
            <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-800 font-semibold">
            Node Count
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            <AnimatedCounter value={stats.total_packages || 0} />
          </div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Dependency Packages</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Excludes manifest root consumer</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-300"></div>
      </motion.div>

      {/* Direct Dependencies */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className="relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-indigo-500/40 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/40 font-semibold">
            {directPct}% of tree
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            <AnimatedCounter value={stats.direct_dependencies_count || 0} />
          </div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Direct Dependencies</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Declared in primary manifest</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-300"></div>
      </motion.div>

      {/* Transitive Dependencies */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className="relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-sky-500/40 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl border border-sky-500/20 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <GitFork className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <span className="text-[10px] font-mono text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-2.5 py-0.5 rounded-full border border-sky-200 dark:border-sky-800/40 font-semibold">
            {transitivePct}% sub-tree
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            <AnimatedCounter value={stats.transitive_dependencies_count || 0} />
          </div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Transitive Dependencies</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Nested upstream packages</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-sky-500/15 transition-all duration-300"></div>
      </motion.div>

      {/* Circular Dependencies / Cycles */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className={`relative overflow-hidden bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group ${
          stats.has_cycles ? 'border-rose-500/40 hover:border-rose-400' : 'border-slate-200/90 dark:border-white/[0.08] hover:border-emerald-500/40'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl border group-hover:scale-105 transition-transform duration-200 ${
            stats.has_cycles
              ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/30 shadow-glow-rose'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-glow-emerald'
          }`}>
            {stats.has_cycles ? (
              <RefreshCcw className="w-5 h-5 text-rose-500 dark:text-rose-400 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <span className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
            stats.has_cycles
              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40'
          }`}>
            {stats.has_cycles ? 'Cyclic Graph' : 'Valid DAG'}
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold font-mono tracking-tight">
            {stats.has_cycles ? (
              <span className="text-rose-600 dark:text-rose-400">{stats.cycle_count} loop(s)</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">0 loops</span>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Circular Dependencies</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats.has_cycles ? 'Requires dependency decoupling' : 'Topologically sortable (Acyclic)'}
          </div>
        </div>
        <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full blur-2xl pointer-events-none transition-all duration-300 ${
          stats.has_cycles ? 'bg-rose-500/15' : 'bg-emerald-500/10 group-hover:bg-emerald-500/15'
        }`}></div>
      </motion.div>
    </motion.div>
  );
}
