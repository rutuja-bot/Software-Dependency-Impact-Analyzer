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
        className="relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#19B6A4]/50 dark:hover:border-[#19B6A4]/50 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-glow-sm group-hover:scale-105 transition-transform duration-200">
            <Package className="w-5 h-5 text-[#19B6A4]" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] font-mono tracking-tight">
            <AnimatedCounter value={stats.total_packages || 0} />
          </div>
          <div className="text-base font-semibold text-slate-800 dark:text-[#94A3B8] mt-1.5">Dependency Packages</div>
          <div className="text-xs text-slate-500 dark:text-[#64748B] mt-0.5">Excludes manifest root consumer</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-[#19B6A4]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#19B6A4]/15 transition-all duration-300"></div>
      </motion.div>

      {/* Direct Dependencies */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className="relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#4C8DCE]/50 dark:hover:border-[#4C8DCE]/50 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-[#4C8DCE]/10 text-[#4C8DCE] rounded-xl border border-[#4C8DCE]/20 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <Layers className="w-5 h-5 text-[#4C8DCE]" />
          </div>
          <span className="text-xs font-mono text-[#4C8DCE] bg-[#4C8DCE]/10 px-2.5 py-0.5 rounded-full border border-[#4C8DCE]/30 font-semibold">
            {directPct}% of tree
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] font-mono tracking-tight">
            <AnimatedCounter value={stats.direct_dependencies_count || 0} />
          </div>
          <div className="text-base font-semibold text-slate-800 dark:text-[#94A3B8] mt-1.5">Direct Dependencies</div>
          <div className="text-xs text-slate-500 dark:text-[#64748B] mt-0.5">Declared in primary manifest</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-[#4C8DCE]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#4C8DCE]/15 transition-all duration-300"></div>
      </motion.div>

      {/* Transitive Dependencies */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className="relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#38BDF8]/50 dark:hover:border-[#38BDF8]/50 rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group"
      >
        <div className="flex items-start justify-between">
          <div className="p-3 bg-sky-500/10 text-sky-500 rounded-xl border border-sky-500/20 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <GitFork className="w-5 h-5 text-sky-500" />
          </div>
          <span className="text-xs font-mono text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/30 font-semibold">
            {transitivePct}% sub-tree
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] font-mono tracking-tight">
            <AnimatedCounter value={stats.transitive_dependencies_count || 0} />
          </div>
          <div className="text-base font-semibold text-slate-800 dark:text-[#94A3B8] mt-1.5">Transitive Dependencies</div>
          <div className="text-xs text-slate-500 dark:text-[#64748B] mt-0.5">Nested upstream packages</div>
        </div>
        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-sky-500/15 transition-all duration-300"></div>
      </motion.div>

      {/* Circular Dependencies / Cycles */}
      <motion.div
        whileHover={cardHover}
        whileTap={{ scale: 0.99 }}
        className={`relative overflow-hidden bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border rounded-2xl p-5 shadow-2xs dark:shadow-card transition-colors duration-200 group ${
          stats.has_cycles ? 'border-[#F05252]/40 hover:border-[#F05252]' : 'border-slate-200/90 dark:border-[#26364D] hover:border-[#22C55E]/50'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl border group-hover:scale-105 transition-transform duration-200 ${
            stats.has_cycles
              ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30 shadow-glow-rose'
              : 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20 shadow-glow-emerald'
          }`}>
            {stats.has_cycles ? (
              <RefreshCcw className="w-5 h-5 text-[#F05252] animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
            )}
          </div>
          <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
            stats.has_cycles
              ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30'
              : 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
          }`}>
            {stats.has_cycles ? 'Cyclic Graph' : 'Valid DAG'}
          </span>
        </div>
        <div className="mt-4">
          <div className="text-3xl font-extrabold font-mono tracking-tight">
            {stats.has_cycles ? (
              <span className="text-[#F05252]">{stats.cycle_count} loop(s)</span>
            ) : (
              <span className="text-[#22C55E]">0 loops</span>
            )}
          </div>
          <div className="text-base font-semibold text-slate-800 dark:text-[#94A3B8] mt-1.5">Circular Dependencies</div>
          <div className="text-xs text-slate-500 dark:text-[#64748B] mt-0.5">
            {stats.has_cycles ? 'Requires dependency decoupling' : 'Topologically sortable (Acyclic)'}
          </div>
        </div>
        <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full blur-2xl pointer-events-none transition-all duration-300 ${
          stats.has_cycles ? 'bg-[#F05252]/15' : 'bg-[#22C55E]/10 group-hover:bg-[#22C55E]/15'
        }`}></div>
      </motion.div>
    </motion.div>
  );
}
