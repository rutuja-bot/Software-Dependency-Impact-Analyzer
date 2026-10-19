import React, { useState } from 'react';
import { Target, ArrowRight, ShieldAlert, Layers } from 'lucide-react';
import { getDownstreamImpact } from '../services/api';

export default function NodeInspector({ selectedNode, nodes, onSelectAnother }) {
  const [impactData, setImpactData] = useState(null);
  const [isImpactLoading, setIsImpactLoading] = useState(false);

  const nodeObj = nodes.find((n) => n.name === selectedNode);

  const handleComputeImpact = async () => {
    if (!selectedNode) return;
    setIsImpactLoading(true);
    try {
      const res = await getDownstreamImpact(selectedNode);
      setImpactData(res);
    } catch (err) {
      console.error("Failed to compute downstream impact", err);
    } finally {
      setIsImpactLoading(false);
    }
  };

  if (!nodeObj) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 text-center text-slate-400">
        <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Click on any node in the dependency graph to inspect its properties and calculate downstream blast radius.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Inspecting Node</div>
          <h3 className="text-lg font-bold text-white font-mono">{nodeObj.name}</h3>
        </div>
        <span className="text-xs font-mono bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-1 rounded">
          {nodeObj.version ? `v${nodeObj.version}` : 'Version Unknown'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block">Classification:</span>
          <span className="font-semibold text-slate-200 capitalize">{nodeObj.dep_type}</span>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block">Root Hop Distance:</span>
          <span className="font-semibold text-slate-200">{nodeObj.depth !== null ? `${nodeObj.depth} hops` : 'Unreachable'}</span>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block">Out-Degree (Dependencies):</span>
          <span className="font-semibold text-slate-200">{nodeObj.out_degree} package(s)</span>
        </div>
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block">In-Degree (Dependents):</span>
          <span className="font-semibold text-slate-200">{nodeObj.in_degree} package(s)</span>
        </div>
      </div>

      {/* Action to compute downstream impact */}
      <div className="pt-2">
        <button
          onClick={handleComputeImpact}
          disabled={isImpactLoading || nodeObj.is_root}
          className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-xs font-semibold py-2 px-3 rounded-lg shadow transition"
        >
          <Target className="w-4 h-4" />
          <span>{isImpactLoading ? 'Traversing Reverse Graph...' : 'Calculate Downstream Blast Radius'}</span>
        </button>
      </div>

      {/* Downstream Impact Results */}
      {impactData && (
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 space-y-2 mt-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-rose-400 flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Downstream Affected Packages:</span>
            </span>
            <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-mono">
              {impactData.affected_count}
            </span>
          </div>

          {impactData.affected_count === 0 ? (
            <p className="text-xs text-slate-400 italic">No other packages depend on this package.</p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {impactData.affected_packages.map((pkg) => (
                <div key={pkg} className="flex items-center justify-between text-xs bg-slate-800/80 px-2 py-1 rounded border border-slate-700">
                  <span className="font-mono text-slate-300">{pkg}</span>
                  {impactData.reverse_dependency_paths[pkg] && (
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                      <span>Path:</span>
                      <span className="font-mono text-teal-400">
                        {impactData.reverse_dependency_paths[pkg][0].join(' → ')}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
