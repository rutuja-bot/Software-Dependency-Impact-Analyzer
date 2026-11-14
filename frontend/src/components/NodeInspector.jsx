import React, { useState } from 'react';
import { Target, ArrowRight, ShieldAlert, Layers, GitPullRequest, GitFork, ArrowDownRight, Compass } from 'lucide-react';
import { getDownstreamImpact } from '../services/api';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function NodeInspector({ selectedNode, nodes, onSelectAnother }) {
  const shouldReduceMotion = useReducedMotion();
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
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 text-center text-slate-500 dark:text-slate-400 space-y-3 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3 bg-slate-100 dark:bg-slate-800/60 text-slate-500 rounded-xl w-fit mx-auto border border-slate-200 dark:border-slate-700/60">
          <Layers className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-300">No Package Selected</div>
          <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
            Click on any node in the dependency graph to inspect its properties and calculate its downstream blast radius.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-2xs dark:shadow-card transition-colors duration-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
            Inspected Node
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white font-mono truncate max-w-[200px]">
            {nodeObj.name}
          </h3>
        </div>
        <span className="text-sm font-mono bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 px-2.5 py-1 rounded-full font-semibold">
          {nodeObj.version ? `v${nodeObj.version}` : 'vUnknown'}
        </span>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-2 gap-2.5 text-sm">
        <div className="bg-slate-50 dark:bg-[#070b14] p-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
          <span className="text-slate-500 block text-xs uppercase font-bold tracking-wider">Classification</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize mt-0.5 block">{nodeObj.dep_type}</span>
        </div>
        <div className="bg-slate-50 dark:bg-[#070b14] p-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
          <span className="text-slate-500 block text-xs uppercase font-bold tracking-wider">Root Hop Distance</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block font-mono">
            {nodeObj.depth !== null ? `${nodeObj.depth} hops` : 'Unreachable'}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-[#070b14] p-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
          <span className="text-slate-500 block text-xs uppercase font-bold tracking-wider">Out-Degree (Deps)</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block font-mono">
            {nodeObj.out_degree} package(s)
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-[#070b14] p-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
          <span className="text-slate-500 block text-xs uppercase font-bold tracking-wider">In-Degree (Dependents)</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block font-mono">
            {nodeObj.in_degree} package(s)
          </span>
        </div>
      </div>

      {/* Blast Radius Action */}
      <div className="pt-1">
        <motion.button
          onClick={handleComputeImpact}
          disabled={isImpactLoading || nodeObj.is_root}
          whileHover={isImpactLoading || nodeObj.is_root ? {} : { scale: 1.01 }}
          whileTap={isImpactLoading || nodeObj.is_root ? {} : { scale: 0.98 }}
          className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-xl shadow-glow-sm transition duration-200"
        >
          <Target className={`w-4 h-4 ${isImpactLoading ? 'animate-spin' : ''}`} />
          <span>{isImpactLoading ? 'Traversing Reverse Graph (BFS)...' : 'Calculate Downstream Blast Radius'}</span>
        </motion.button>
      </div>

      {/* Downstream Impact Results */}
      <AnimatePresence>
        {impactData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: easeSoft }}
            className="bg-slate-50 dark:bg-[#070b14] border border-slate-200/80 dark:border-white/[0.08] rounded-xl p-3.5 space-y-2.5 mt-2 overflow-hidden"
          >
            <div className="flex items-center justify-between text-sm font-bold border-b border-slate-200/80 dark:border-white/[0.06] pb-2">
              <span className="text-rose-600 dark:text-rose-400 flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Downstream Affected:</span>
              </span>
              <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded font-mono text-xs">
                {impactData.affected_count} packages
              </span>
            </div>

            {impactData.affected_count === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic py-1">
                No downstream packages depend on this node. It is a leaf package or top-level consumer.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {impactData.affected_packages.map((pkg) => (
                  <div key={pkg} className="text-sm bg-white dark:bg-[#0f1422] px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.05] space-y-0.5">
                    <div className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{pkg}</div>
                    {impactData.reverse_dependency_paths[pkg] && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                        <span className="text-slate-400 dark:text-slate-500">Path:</span>
                        <span className="font-mono text-cyan-700 dark:text-cyan-400 truncate">
                          {impactData.reverse_dependency_paths[pkg][0].join(' → ')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
