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
import { simulateChange, compareSimulation } from '../services/api';
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
      const [res, compRes] = await Promise.all([
        simulateChange(
          operation,
          targetPackage.trim(),
          sourcePackage.trim() || null,
          version.trim() || null,
          depType,
          analysisId
        ),
        compareSimulation(
          operation,
          targetPackage.trim(),
          sourcePackage.trim() || null,
          version.trim() || null,
          depType,
          analysisId
        ).catch((compErr) => {
          console.warn("Before-and-after comparison failed to fetch:", compErr);
          return null;
        })
      ]);
      onSimulationSuccess(res, compRes);
    } catch (err) {
      console.error('Simulation error', err);
      const detail = err.response?.data?.detail || err.message || 'Simulation request failed.';
      setErrorMsg(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const opTabs = [
    { id: 'add', shortLabel: '+ Add', fullLabel: '+ Add Package', icon: PlusCircle, activeClass: 'text-[#22C55E]', bgClass: 'from-[#22C55E]/15 to-emerald-500/10 border-[#22C55E]/30' },
    { id: 'upgrade', shortLabel: '^ Upgrade', fullLabel: '^ Upgrade Package', icon: ArrowUpCircle, activeClass: 'text-[#19B6A4]', bgClass: 'from-[#19B6A4]/15 to-teal-500/10 border-[#19B6A4]/30' },
    { id: 'remove', shortLabel: '- Remove', fullLabel: '- Remove Package', icon: Trash2, activeClass: 'text-[#F05252]', bgClass: 'from-[#F05252]/15 to-rose-500/10 border-[#F05252]/30' },
  ];

  return (
    <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#26364D] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-sm">
            <Sparkles className="w-5 h-5 text-[#19B6A4]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">Simulation Controls</h2>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8]">
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
            className="flex items-center space-x-1.5 text-sm font-semibold text-[#F05252] hover:text-white bg-[#F05252]/10 hover:bg-[#F05252] px-4 py-2 rounded-xl border border-[#F05252]/30 transition shadow-2xs duration-150"
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
            className="flex items-start space-x-2.5 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25 overflow-hidden"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#F05252] mt-0.5" />
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
                    : 'bg-slate-50 dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] hover:bg-slate-100 dark:hover:bg-[#172438]'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeOpTab"
                    className={`absolute inset-0 bg-gradient-to-r ${tab.bgClass} rounded-xl border shadow-2xs`}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center space-x-1 sm:space-x-2">
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.fullLabel}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Inputs based on operation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">

          {/* Target Package */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block text-slate-800 dark:text-[#F1F5F9] font-bold text-sm">
              Target Package <span className="text-[#F05252]">*</span>
            </label>
            {operation === 'add' ? (
              <input
                type="text"
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                placeholder="e.g. redis, lodash, axios"
                className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2 text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4]/60 font-mono text-sm transition"
              />
            ) : (
              <select
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2 text-slate-900 dark:text-[#F1F5F9] focus:outline-none focus:border-[#19B6A4]/60 font-mono text-sm transition cursor-pointer"
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
            <label className="block text-slate-800 dark:text-[#F1F5F9] font-bold text-sm">
              Dependent Parent
            </label>
            <select
              value={sourcePackage}
              onChange={(e) => setSourcePackage(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2 text-slate-900 dark:text-[#F1F5F9] focus:outline-none focus:border-[#19B6A4]/60 font-mono text-sm transition cursor-pointer"
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
            <label className="block text-slate-800 dark:text-[#F1F5F9] font-bold text-sm">
              {operation === 'upgrade' ? 'Proposed Version *' : 'Version Constraint'}
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={operation === 'remove'}
              placeholder={operation === 'upgrade' ? 'e.g. 5.0.0' : '^1.0.0'}
              className={`w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2 text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4]/60 font-mono text-sm transition ${
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
            className="flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] disabled:opacity-50 text-[#0B1220] font-bold text-sm px-6 py-2.5 rounded-xl shadow-glow-teal transition duration-200"
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
            className="bg-slate-50 dark:bg-[#111C2E] border border-[#19B6A4]/40 rounded-2xl p-5 space-y-4 mt-4 shadow-2xs dark:shadow-card overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-[#26364D] pb-3">
              <div className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-[#F1F5F9]">
                <GitPullRequest className="w-4 h-4 text-[#19B6A4]" />
                <span>Simulated Change Summary: {simulationResult.message}</span>
              </div>
              <span className="text-xs uppercase tracking-wider font-bold bg-[#19B6A4]/10 text-[#19B6A4] border border-[#19B6A4]/30 px-2.5 py-1 rounded-full">
                In-Memory Diff Active
              </span>
            </div>

            {/* Diff Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-white dark:bg-[#172438] p-3 rounded-xl border border-[#22C55E]/30">
                <span className="text-slate-500 dark:text-[#94A3B8] block text-xs uppercase font-bold tracking-wider">Added Nodes</span>
                <span className="font-semibold text-[#22C55E] font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.added_nodes.length > 0
                    ? `+ ${simulationResult.diff.added_nodes.join(', ')}`
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#172438] p-3 rounded-xl border border-[#F05252]/30">
                <span className="text-slate-500 dark:text-[#94A3B8] block text-xs uppercase font-bold tracking-wider">Removed Nodes</span>
                <span className="font-semibold text-[#F05252] font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.removed_nodes.length > 0
                    ? `- ${simulationResult.diff.removed_nodes.join(', ')}`
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#172438] p-3 rounded-xl border border-[#F59E0B]/30">
                <span className="text-slate-500 dark:text-[#94A3B8] block text-xs uppercase font-bold tracking-wider">Orphaned Nodes</span>
                <span className="font-semibold text-[#F59E0B] font-mono text-sm mt-1 block truncate">
                  {simulationResult.diff.orphaned_nodes.length > 0
                    ? simulationResult.diff.orphaned_nodes.join(', ')
                    : 'None'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#172438] p-3 rounded-xl border border-[#19B6A4]/30">
                <span className="text-slate-500 dark:text-[#94A3B8] block text-xs uppercase font-bold tracking-wider">Blast Radius Shift</span>
                <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] mt-1 block font-mono text-sm">
                  {simulationResult.impact_diff.baseline_affected_count} &rarr;{' '}
                  <span className="text-[#19B6A4] font-bold">{simulationResult.impact_diff.simulated_affected_count}</span> affected
                </span>
              </div>
            </div>

            {/* Cycle Delta Alerts */}
            {simulationResult.cycle_diff.introduced_cycles.length > 0 && (
              <div className="bg-[#F05252]/10 border border-[#F05252]/30 p-3.5 rounded-xl text-sm space-y-1.5">
                <div className="font-bold text-[#F05252] flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-[#F05252]" />
                  <span>Simulation Introduces New Circular Loops:</span>
                </div>
                {simulationResult.cycle_diff.introduced_cycles.map((cyc, idx) => (
                  <div key={idx} className="font-mono text-xs sm:text-[13px] text-[#F05252] bg-white dark:bg-[#172438] px-2.5 py-1 rounded-lg border border-[#F05252]/30">
                    + Loop: {cyc.cycle_path.join(' → ')}
                  </div>
                ))}
              </div>
            )}

            {simulationResult.cycle_diff.eliminated_cycles.length > 0 && (
              <div className="bg-[#22C55E]/10 border border-[#22C55E]/30 p-3.5 rounded-xl text-sm space-y-1.5">
                <div className="font-bold text-[#22C55E] flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-[#22C55E]" />
                  <span>Simulation Successfully Breaks Existing Circular Loops:</span>
                </div>
                {simulationResult.cycle_diff.eliminated_cycles.map((cyc, idx) => (
                  <div key={idx} className="font-mono text-xs sm:text-[13px] text-[#22C55E] bg-white dark:bg-[#172438] px-2.5 py-1 rounded-lg border border-[#22C55E]/30">
                    - Eliminated Loop: {cyc.cycle_path.join(' → ')}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {simulationResult.warnings.length > 0 && (
              <div className="text-xs sm:text-[13px] text-[#F59E0B] bg-[#F59E0B]/10 p-3 rounded-xl border border-[#F59E0B]/25 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
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
