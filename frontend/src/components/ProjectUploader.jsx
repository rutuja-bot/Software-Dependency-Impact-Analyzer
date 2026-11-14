import React, { useState } from 'react';
import { Upload, Play, FileJson, AlertCircle, RotateCcw, Check, FileCode, Lock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

const SAMPLE_PACKAGE_JSON = {
  name: "sample-node-service",
  version: "1.2.0",
  dependencies: {
    "express": "^4.18.2",
    "dotenv": "^16.4.5",
    "winston": "^3.11.0"
  },
  devDependencies: {
    "jest": "^29.7.0"
  }
};

const SAMPLE_PACKAGE_LOCK = {
  name: "sample-node-service",
  version: "1.2.0",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "sample-node-service",
      version: "1.2.0",
      dependencies: {
        "dotenv": "^16.4.5",
        "express": "^4.18.2",
        "winston": "^3.11.0"
      }
    },
    "node_modules/dotenv": { "version": "16.4.5", "dependencies": {} },
    "node_modules/express": {
      "version": "4.18.2",
      "dependencies": {
        "accepts": "~1.3.8",
        "cookie": "0.5.0",
        "depd": "2.0.0"
      }
    },
    "node_modules/accepts": {
      "version": "1.3.8",
      "dependencies": { "mime-types": "~2.1.34" }
    },
    "node_modules/mime-types": { "version": "2.1.34", "dependencies": {} },
    "node_modules/cookie": { "version": "0.5.0", "dependencies": {} },
    "node_modules/depd": { "version": "2.0.0", "dependencies": {} },
    "node_modules/winston": {
      "version": "3.11.0",
      "dependencies": { "async": "^3.2.5" }
    },
    "node_modules/async": { "version": "3.2.5", "dependencies": {} }
  }
};

export default function ProjectUploader({ onAnalyze, isLoading }) {
  const shouldReduceMotion = useReducedMotion();
  const [pkgText, setPkgText] = useState(JSON.stringify(SAMPLE_PACKAGE_JSON, null, 2));
  const [lockText, setLockText] = useState(JSON.stringify(SAMPLE_PACKAGE_LOCK, null, 2));
  const [includeLock, setIncludeLock] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleLoadSample = () => {
    setPkgText(JSON.stringify(SAMPLE_PACKAGE_JSON, null, 2));
    setLockText(JSON.stringify(SAMPLE_PACKAGE_LOCK, null, 2));
    setIncludeLock(true);
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPkgText('{\n  "name": "",\n  "version": "1.0.0",\n  "dependencies": {}\n}');
    setLockText('');
    setIncludeLock(false);
    setErrorMsg(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg(null);

    let parsedPkg;
    try {
      parsedPkg = JSON.parse(pkgText);
    } catch (err) {
      setErrorMsg("Invalid JSON syntax in package.json. Please check commas, quotes, and brackets.");
      return;
    }

    if (!parsedPkg.name) {
      setErrorMsg("package.json must contain a valid \"name\" field.");
      return;
    }

    let parsedLock = null;
    if (includeLock && lockText.trim()) {
      try {
        parsedLock = JSON.parse(lockText);
      } catch (err) {
        setErrorMsg("Invalid JSON syntax in package-lock.json. Please check commas, quotes, and brackets.");
        return;
      }
    }

    onAnalyze(parsedPkg, parsedLock);
  };

  return (
    <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header with Title and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20 shadow-glow-sm">
            <FileCode className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Project Manifest Input</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste <code className="text-cyan-700 dark:text-cyan-400 font-mono">package.json</code> and optional lockfile to construct the directed dependency graph
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <motion.button
            type="button"
            onClick={handleClear}
            whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-150"
          >
            Clear Fields
          </motion.button>
          <motion.button
            type="button"
            onClick={handleLoadSample}
            whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
            className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 px-3 py-1.5 rounded-xl border border-cyan-200 dark:border-cyan-500/25 transition shadow-2xs duration-150"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Load Sample Manifest</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            className="flex items-start space-x-2.5 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/25 overflow-hidden"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* package.json editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <FileJson className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>package.json <span className="text-rose-500 dark:text-rose-400">*</span></span>
              </label>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">Root & Direct Dependencies</span>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-white/[0.08] focus-within:border-cyan-500/50 bg-slate-50 dark:bg-[#070b14] transition duration-200">
              <textarea
                rows={10}
                value={pkgText}
                onChange={(e) => setPkgText(e.target.value)}
                className="w-full bg-transparent p-3.5 text-xs font-mono text-slate-800 dark:text-cyan-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                placeholder="Paste package.json contents..."
                spellCheck="false"
              />
            </div>
          </div>

          {/* package-lock.json editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>package-lock.json (Optional)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700/80">
                <input
                  type="checkbox"
                  checked={includeLock}
                  onChange={(e) => setIncludeLock(e.target.checked)}
                  className="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-0 cursor-pointer"
                />
                <span className="font-medium text-[11px]">Include Lockfile</span>
              </label>
            </div>

            <div className={`relative rounded-2xl overflow-hidden border border-slate-300 dark:border-white/[0.08] focus-within:border-indigo-500/50 bg-slate-50 dark:bg-[#070b14] transition duration-200 ${
              !includeLock ? 'opacity-40 cursor-not-allowed' : ''
            }`}>
              <textarea
                rows={10}
                disabled={!includeLock}
                value={lockText}
                onChange={(e) => setLockText(e.target.value)}
                className="w-full bg-transparent p-3.5 text-xs font-mono text-slate-800 dark:text-indigo-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                placeholder="Paste package-lock.json (v1, v2, or v3) to resolve full transitive dependency sub-trees..."
                spellCheck="false"
              />
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse"></span>
            <span>Parsing supports NPM v1, v2, and v3 lockfiles with full nested dependency resolution.</span>
          </div>

          <motion.button
            type="submit"
            disabled={isLoading}
            whileHover={isLoading ? {} : { scale: 1.02 }}
            whileTap={isLoading ? {} : { scale: 0.98 }}
            className="flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-glow-sm transition duration-200"
          >
            <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Constructing Directed Graph...' : 'Analyze & Build Graph'}</span>
          </motion.button>
        </div>
      </form>
    </div>
  );
}
