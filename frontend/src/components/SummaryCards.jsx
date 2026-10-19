import React from 'react';
import { Package, GitFork, RefreshCcw, Layers } from 'lucide-react';

export default function SummaryCards({ stats }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Packages */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
        <div className="p-3 bg-brand-500/10 text-brand-500 rounded-lg">
          <Package className="w-6 h-6 text-teal-400" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Dependency Packages</div>
          <div className="text-2xl font-bold text-white">{stats.total_packages}</div>
          <div className="text-[10px] text-slate-500">Excludes root project</div>
        </div>
      </div>

      {/* Direct Dependencies */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
          <Layers className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Direct Dependencies</div>
          <div className="text-2xl font-bold text-white">{stats.direct_dependencies_count}</div>
        </div>
      </div>

      {/* Transitive Dependencies */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
        <div className="p-3 bg-sky-500/10 text-sky-400 rounded-lg">
          <GitFork className="w-6 h-6 text-sky-400" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Transitive Dependencies</div>
          <div className="text-2xl font-bold text-white">{stats.transitive_dependencies_count}</div>
        </div>
      </div>

      {/* Circular Dependencies / Cycles */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
        <div className={`p-3 rounded-lg ${stats.has_cycles ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
          <RefreshCcw className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400">Detected Cycles</div>
          <div className="text-2xl font-bold text-white">
            {stats.has_cycles ? (
              <span className="text-rose-400">{stats.cycle_count} loop(s)</span>
            ) : (
              <span className="text-emerald-400">0 (Acyclic)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
