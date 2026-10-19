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
  GitPullRequest
} from 'lucide-react';
import { simulateChange } from '../services/api';

export default function SimulationPanel({ 
  nodes, 
  rootPackage, 
  onSimulationSuccess, 
  onResetSimulation, 
  isSimulatedActive,
  simulationResult,
  analysisId = null
}) {
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

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">In-Memory "What-If" Change Simulator</h2>
            <p className="text-xs text-slate-400">Non-destructive dependency modification preview</p>
          </div>
        </div>

        {isSimulatedActive && (
          <button
            type="button"
            onClick={onResetSimulation}
            className="flex items-center space-x-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 transition shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard & Return to Baseline</span>
          </button>
        )}
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Operation selector pills */}
      <form onSubmit={handleSimulate} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setOperation('add')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
              operation === 'add'
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Dep</span>
          </button>

          <button
            type="button"
            onClick={() => setOperation('upgrade')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
              operation === 'upgrade'
                ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span>Upgrade Dep</span>
          </button>

          <button
            type="button"
            onClick={() => setOperation('remove')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition ${
              operation === 'remove'
                ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Dep</span>
          </button>
        </div>

        {/* Dynamic Inputs based on operation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Target Package */}
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-semibold mb-1">
              Target Package <span className="text-rose-400">*</span>
            </label>
            {operation === 'add' ? (
              <input
                type="text"
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                placeholder="e.g. redis, @types/node, lodash"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            ) : (
              <select
                value={targetPackage}
                onChange={(e) => setTargetPackage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="">-- Select an existing package --</option>
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

          {/* Source Package (Optional / Add only) */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Dependent Parent
            </label>
            <select
              value={sourcePackage}
              onChange={(e) => setSourcePackage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="">Project Root ({rootPackage})</option>
              {existingPackageNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Version (for Upgrade or Add) */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              {operation === 'upgrade' ? 'Proposed Version *' : 'Version Constraint'}
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={operation === 'remove'}
              placeholder={operation === 'upgrade' ? 'e.g. 5.0.0' : '^1.0.0'}
              className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono ${
                operation === 'remove' ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-medium text-xs px-5 py-2.5 rounded-lg shadow transition"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Simulating Delta Diff...' : 'Simulate Change'}</span>
          </button>
        </div>
      </form>

      {/* Simulation Result Diff Summary Banner */}
      {isSimulatedActive && simulationResult && (
        <div className="bg-slate-900/90 border border-indigo-500/40 rounded-xl p-4 space-y-3 mt-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-300">
              <GitPullRequest className="w-4 h-4 text-indigo-400" />
              <span>Simulated Change Summary: {simulationResult.message}</span>
            </div>
            <span className="text-[11px] uppercase tracking-wider font-semibold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">
              Active Simulation Preview
            </span>
          </div>

          {/* Diff Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[11px]">Added Nodes:</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {simulationResult.diff.added_nodes.length > 0
                  ? simulationResult.diff.added_nodes.join(', ')
                  : 'None'}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[11px]">Removed Nodes:</span>
              <span className="font-semibold text-rose-400 font-mono">
                {simulationResult.diff.removed_nodes.length > 0
                  ? simulationResult.diff.removed_nodes.join(', ')
                  : 'None'}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[11px]">Orphaned / Unreachable:</span>
              <span className="font-semibold text-orange-400 font-mono">
                {simulationResult.diff.orphaned_nodes.length > 0
                  ? simulationResult.diff.orphaned_nodes.join(', ')
                  : 'None'}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[11px]">Downstream Blast Radius:</span>
              <span className="font-semibold text-slate-200">
                {simulationResult.impact_diff.baseline_affected_count} &rarr;{' '}
                <span className="text-teal-400">{simulationResult.impact_diff.simulated_affected_count}</span> affected
              </span>
            </div>
          </div>

          {/* Cycle Delta Alerts */}
          {simulationResult.cycle_diff.introduced_cycles.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-600/50 p-2.5 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-rose-300 flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Change Introduces New Circular Dependencies:</span>
              </div>
              {simulationResult.cycle_diff.introduced_cycles.map((cyc, idx) => (
                <div key={idx} className="font-mono text-[11px] text-rose-200">
                  + Loop: {cyc.cycle_path.join(' → ')}
                </div>
              ))}
            </div>
          )}

          {simulationResult.cycle_diff.eliminated_cycles.length > 0 && (
            <div className="bg-emerald-950/40 border border-emerald-600/50 p-2.5 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-emerald-300 flex items-center space-x-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Change Successfully Breaks Existing Circular Loops:</span>
              </div>
              {simulationResult.cycle_diff.eliminated_cycles.map((cyc, idx) => (
                <div key={idx} className="font-mono text-[11px] text-emerald-200">
                  - Eliminated: {cyc.cycle_path.join(' → ')}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {simulationResult.warnings.length > 0 && (
            <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded border border-amber-500/20 space-y-0.5">
              {simulationResult.warnings.map((w, idx) => (
                <div key={idx}>&bull; {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
