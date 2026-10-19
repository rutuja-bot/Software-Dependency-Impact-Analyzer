import React, { useState } from 'react';
import { Upload, Play, FileJson, AlertCircle } from 'lucide-react';

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg(null);

    let parsedPkg;
    try {
      parsedPkg = JSON.parse(pkgText);
    } catch (err) {
      setErrorMsg("Invalid JSON in package.json. Please check your syntax.");
      return;
    }

    let parsedLock = null;
    if (includeLock && lockText.trim()) {
      try {
        parsedLock = JSON.parse(lockText);
      } catch (err) {
        setErrorMsg("Invalid JSON in package-lock.json. Please check your syntax.");
        return;
      }
    }

    onAnalyze(parsedPkg, parsedLock);
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileJson className="w-5 h-5 text-teal-400" />
          <h2 className="text-base font-semibold text-white">Project Manifest Input</h2>
        </div>
        <button
          type="button"
          onClick={handleLoadSample}
          className="text-xs font-medium text-teal-400 hover:text-teal-300 bg-teal-500/10 px-2.5 py-1.5 rounded-lg border border-teal-500/20 transition"
        >
          Reset to Sample Data
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center space-x-2 text-sm text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* package.json */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              package.json <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={8}
              value={pkgText}
              onChange={(e) => setPkgText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500 transition resize-none"
              placeholder="Paste package.json here..."
            />
          </div>

          {/* package-lock.json */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                package-lock.json (v1, v2, v3)
              </label>
              <label className="flex items-center space-x-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLock}
                  onChange={(e) => setIncludeLock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0"
                />
                <span>Include Lockfile</span>
              </label>
            </div>
            <textarea
              rows={8}
              disabled={!includeLock}
              value={lockText}
              onChange={(e) => setLockText(e.target.value)}
              className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500 transition resize-none ${
                !includeLock ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              placeholder="Paste package-lock.json here to resolve transitive dependencies..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white font-medium text-sm px-5 py-2.5 rounded-lg shadow transition"
          >
            <Play className="w-4 h-4" />
            <span>{isLoading ? 'Analyzing Graph...' : 'Analyze Dependency Graph'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
