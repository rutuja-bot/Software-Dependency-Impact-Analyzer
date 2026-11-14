import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  PlusCircle,
  Trash2,
  ArrowUpCircle,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  GitPullRequest,
  Layers,
  ArrowRight
} from 'lucide-react';
import { simulateChange } from '../services/api';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function SimulationPanel({
  nodes,
  rootPackage,
  onSimulationSuccess,
  onResetSimulation,
  isSimulatedActive,
  simulationResult,
  analysisId = null
}) {
  const shouldReduceMotion = useReducedMotion();
  const [operation, setOperation] = useState('add');
  const [targetPackage, setTargetPackage] = useState('');
  const [sourcePackage, setSourcePackage] = useState('');
  const [version, setVersion] = useState('');
  const [depType, setDepType] = useState('direct');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const existingPackageNames = nodes.map((n) => n.name);

  const handleSimulate = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!targetPackage.trim()) {
      setErrorMsg('Please specify a target package name.');
      return;
    }

    if (operation === 'upgrade' && !version.trim()) {
      setErrorMsg('Please specify a proposed version for the upgrade operation.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await simulateChange(
        operation,
        targetPackage.trim(),
        sourcePackage.trim() || null,
        version.trim() || null,
        depType,
        analysisId
      );
      onSimulationSuccess(res);
    } catch (err) {
      console.error('Simulation error', err);
      const detail = err.response?.data?.detail || err.message || 'Simulation request failed.';
      setErrorMsg(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const opTabs = [
    { id: 'add', label: '+ Add Package', icon: PlusCircle, activeClass: 'text-emerald-700 dark:text-emerald-300', bgClass: 'from-emerald-500/15 to-teal-500/10 border-emerald-500/30' },
    { id: 'upgrade', label: '^ Upgrade Package', icon: ArrowUpCircle, activeClass: 'text-cyan-700 dark:text-cyan-300', bgClass: 'from-cyan-500/15 to-teal-500/10 border-cyan-500/30' },
    { id: 'remove', label: '- Remove Package', icon: Trash2, activeClass: 'text-rose-700 dark:text-rose-300', bgClass: 'from-rose-500/15 to-pink-500/10 border-rose-500/30' },
  ];

  return (
    <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 shadow-sm">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Simulation Controls</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure package modifications and evaluate topological impact
            </p>
          </div>
        </div>

        {isSimulatedActive && (
          <motion.button
            type="button"
            onClick={onResetSimulation}
            whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
            className="flex items-center space-x-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:text-white bg-rose-50 hover:bg-rose-600 dark:bg-rose-500/15 dark:hover:bg-rose-600/30 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 transition shadow-2xs duration-150"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard & Return to Baseline</span>
          </motion.button>
        )}
      </div>

      {/* Error alert */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            className="flex items-start space-x-2.5 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/25 overflow-hidden"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operation selector pills with animated layout pill */}
      <form onSubmit={handleSimulate} className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {opTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = operation === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOperation(tab.id)}
                className={`relative flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl text-sm font-bold transition duration-150 ${
                  isSelected
                    ? `${tab.activeClass} shadow-2xs font-bold`
                    : 'bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeOpTab"
                    className={`absolute inset-0 bg-gradient-to-r ${tab.bgClass} rounded-xl border shadow-2xs`}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center space-x-2">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Inputs based on operation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">

          {/* Target Package */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block text-slate-800 dark:text-slate-200 font-bold text-sm">
              Target Package <span className="text-rose-500 dark:text-rose-400">*</span>
            </label>
            {operation === 'add' ? (
              <input
                type="text"
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                placeholder="e.g. redis, lodash, axios"
                className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 font-mono text-sm transition"
              />
            ) : (
              <select
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500/60 font-mono text-sm transition cursor-pointer"
              >
                <option value="">-- Select package from baseline tree --</option>
                {existingPackageNames
                  .filter((p) => p !== rootPackage)
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* Dependent Parent */}
          <div className="space-y-1.5">
            <label className="block text-slate-800 dark:text-slate-200 font-bold text-sm">
              Dependent Parent
            </label>
            <select
              value={sourcePackage}
              onChange={(e) => setSourcePackage(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500/60 font-mono text-sm transition cursor-pointer"
            >
              <option value="">Project Root ({rootPackage})</option>
              {existingPackageNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Version Constraint */}
          <div className="space-y-1.5">
            <label className="block text-slate-800 dark:text-slate-200 font-bold text-sm">
              {operation === 'upgrade' ? 'Proposed Version *' : 'Version Constraint'}
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={operation === 'remove'}
              placeholder={operation === 'upgrade' ? 'e.g. 5.0.0' : '^1.0.0'}
              className={`w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 font-mono text-sm transition ${
                operation === 'remove' ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-end pt-1">
          <motion.button
            type="submit"
            disabled={isLoading}
            whileHover={isLoading ? {} : { scale: 1.02 }}
            whileTap={isLoading ? {} : { scale: 0.98 }}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-glow-sm transition duration-200"
          >
            <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Computing Topological Diff...' : 'Run Simulation'}</span>
          </motion.button>
        </div>
      </form>

      {/* Simulation Result Diff Summary Banner */}
      <AnimatePresence>
        {isSimulatedActive && simulationResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: easeSoft }}
            className="bg-slate-50 dark:bg-[#0c101c] border border-indigo-300 dark:border-indigo-500/40 rounded-2xl p-5 space-y-4 mt-4 shadow-2xs dark:shadow-card overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
              <div className="flex items-center space-x-2 text-sm font-bold text-indigo-800 dark:text-indigo-300">
                <GitPullRequest className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Simulated Change Summary: {simulationResult.message}</span>
              </div>
              <span className="text-xs uppercase tracking-wider font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-1 rounded-full">
                In-Memory Diff Active
              </span>
            </div>

            {/* Diff Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white dark:bg-[#0f1422] p-3 rounded-xl border border-emerald-300 dark:border-emerald-500/20">
                <span className="text-slate-500 dark:text-slate-400 block text-xs uppercase font-bold tracking-wider">Added Nodes</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.added_nodes.length > 0
                    ? `+ ${simulationResult.diff.added_nodes.join(', ')}`
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#0f1422] p-3 rounded-xl border border-rose-300 dark:border-rose-500/20">
                <span className="text-slate-500 dark:text-slate-400 block text-xs uppercase font-bold tracking-wider">Removed Nodes</span>
                <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.removed_nodes.length > 0
                    ? `- ${simulationResult.diff.removed_nodes.join(', ')}`
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#0f1422] p-3 rounded-xl border border-amber-300 dark:border-amber-500/20">
                <span className="text-slate-500 dark:text-slate-400 block text-xs uppercase font-bold tracking-wider">Orphaned Nodes</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400 font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.orphaned_nodes.length > 0
                    ? `~ ${simulationResult.diff.orphaned_nodes.join(', ')}`
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#0f1422] p-3 rounded-xl border border-cyan-300 dark:border-cyan-500/20">
                <span className="text-slate-500 dark:text-slate-400 block text-xs uppercase font-bold tracking-wider">Blast Radius Shift</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-1 block font-mono text-sm">
                  {simulationResult.impact_diff.baseline_affected_count} &rarr;{' '}
                  <span className="text-cyan-700 dark:text-cyan-400 font-bold">{simulationResult.impact_diff.simulated_affected_count}</span> affected
                </span>
              </div>
            </div>

            {/* Cycle Delta Alerts */}
            {simulationResult.cycle_diff.introduced_cycles.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-600/50 p-3.5 rounded-xl text-sm space-y-1.5">
                <div className="font-bold text-rose-800 dark:text-rose-300 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>Simulation Introduces New Circular Loops:</span>
                </div>
                {simulationResult.cycle_diff.introduced_cycles.map((cyc, idx) => (
                  <div key={idx} className="font-mono text-xs sm:text-[13px] text-rose-800 dark:text-rose-200 bg-white dark:bg-rose-900/30 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/40">
                    + Loop: {cyc.cycle_path.join(' → ')}
                  </div>
                ))}
              </div>
            )}

            {simulationResult.cycle_diff.eliminated_cycles.length > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-600/50 p-3.5 rounded-xl text-sm space-y-1.5">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span>Simulation Successfully Breaks Existing Circular Loops:</span>
                </div>
                {simulationResult.cycle_diff.eliminated_cycles.map((cyc, idx) => (
                  <div key={idx} className="font-mono text-xs sm:text-[13px] text-emerald-800 dark:text-emerald-200 bg-white dark:bg-emerald-900/30 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                    - Eliminated Loop: {cyc.cycle_path.join(' → ')}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {simulationResult.warnings.length > 0 && (
              <div className="text-xs sm:text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-200 dark:border-amber-500/25 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Simulation Advisory:</span>
                </div>
                {simulationResult.warnings.map((w, idx) => (
                  <div key={idx} className="pl-4">&bull; {w}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
