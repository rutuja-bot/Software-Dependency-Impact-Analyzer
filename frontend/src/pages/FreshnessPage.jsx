import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Search,
  Layers,
  Sparkles,
  RefreshCw,
  XCircle,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { analyzeFreshness, getAnalysisFreshness } from '../services/api';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AnimatedCounter, Skeleton, easeSoft } from '../utils/animations';

export default function FreshnessPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    freshnessResult,
    setFreshnessResult,
    analysisResult,
    isSimulatedActive
  } = useAnalysis();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLoadingPersisted, setIsLoadingPersisted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Auto-fetch persisted freshness records
  useEffect(() => {
    let isMounted = true;
    const fetchPersistedFreshness = async () => {
      if (!analysisResult?.analysis_id) return;
      if (freshnessResult && freshnessResult.analysis_id === analysisResult.analysis_id) {
        return;
      }
      setIsLoadingPersisted(true);
      setErrorMsg(null);
      try {
        const data = await getAnalysisFreshness(analysisResult.analysis_id);
        if (isMounted) {
          if (data && data.records && data.records.length > 0) {
            setFreshnessResult({
              ...data,
              analysis_id: analysisResult.analysis_id
            });
          } else {
            setFreshnessResult(null);
          }
        }
      } catch (err) {
        if (isMounted && err.response?.status !== 404) {
          console.warn('Failed to load persisted freshness records:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPersisted(false);
        }
      }
    };

    fetchPersistedFreshness();
    return () => { isMounted = false; };
  }, [analysisResult?.analysis_id, freshnessResult?.analysis_id, setFreshnessResult]);

  const handleRunFreshnessAnalysis = async (retryFailed = false) => {
    if (isSimulatedActive) {
      setErrorMsg('Cannot trigger LibYear freshness analysis while a What-If simulation is active. Please reset to baseline first.');
      return;
    }
    if (retryFailed) {
      setIsRetrying(true);
    } else {
      setIsAnalyzing(true);
    }
    setErrorMsg(null);
    try {
      const res = await analyzeFreshness(retryFailed, analysisResult?.analysis_id);
      setFreshnessResult({
        ...res,
        analysis_id: analysisResult?.analysis_id
      });
    } catch (err) {
      console.error('Freshness analysis failed', err);
      const detail = err.response?.data?.detail || err.message || 'LibYear freshness analysis failed.';
      setErrorMsg(detail);
    } finally {
      setIsAnalyzing(false);
      setIsRetrying(false);
    }
  };

  const parseCategory = (p) => {
    if (p.category) return p.category;
    if (p.status === 'scored') return 'scored';
    const reason = (p.reason_unscored || p.reasonUnscored || '').toLowerCase();
    if (
      reason.includes('registry lookup failed') ||
      reason.includes('timed out') ||
      reason.includes('http') ||
      reason.includes('connection error')
    ) {
      return 'lookup_failed';
    }
    return 'unresolved_version';
  };

  const normalizedRecords = useMemo(() => {
    if (!freshnessResult) return [];

    if (Array.isArray(freshnessResult.results)) {
      return freshnessResult.results.map((p) => ({
        packageName: p.package_name,
        installedVersion: p.version || p.installed_version || 'unknown',
        releaseDate: p.release_date,
        libyear: p.libyear !== null && p.libyear !== undefined ? Number(p.libyear) : null,
        status: p.status,
        category: parseCategory(p),
        reasonUnscored: p.reason_unscored
      }));
    }

    if (Array.isArray(freshnessResult.records)) {
      return freshnessResult.records.map((r) => ({
        packageName: r.package_name,
        installedVersion: r.installed_version || r.version || 'unknown',
        releaseDate: r.release_date,
        libyear: r.libyear !== null && r.libyear !== undefined ? Number(r.libyear) : null,
        status: r.status,
        category: parseCategory(r),
        reasonUnscored: r.reason_unscored
      }));
    }

    if (Array.isArray(freshnessResult.packages)) {
      return freshnessResult.packages.map((p) => ({
        packageName: p.package_name,
        installedVersion: p.installed_version || p.version || 'unknown',
        releaseDate: p.release_date,
        libyear: p.libyear !== null && p.libyear !== undefined ? Number(p.libyear) : null,
        status: p.status,
        category: parseCategory(p),
        reasonUnscored: p.reason_unscored
      }));
    }

    return [];
  }, [freshnessResult]);

  const totalLibYear = freshnessResult?.project_total_libyear ?? freshnessResult?.total_libyear ?? 0;
  const avgLibYear = freshnessResult?.project_average_libyear ?? freshnessResult?.average_libyear ?? 0;

  const scoredCount = useMemo(() => (
    normalizedRecords.filter(r => r.category === 'scored').length
  ), [normalizedRecords]);

  const failedLookupCount = useMemo(() => (
    normalizedRecords.filter(r => r.category === 'lookup_failed').length
  ), [normalizedRecords]);

  const unresolvedVersionCount = useMemo(() => (
    normalizedRecords.filter(r => r.category === 'unresolved_version').length
  ), [normalizedRecords]);

  const filteredRecords = useMemo(() => {
    return normalizedRecords.filter((r) => {
      if (activeTab === 'scored' && r.category !== 'scored') return false;
      if (activeTab === 'lookup_failed' && r.category !== 'lookup_failed') return false;
      if (activeTab === 'unresolved_version' && r.category !== 'unresolved_version') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.packageName.toLowerCase().includes(q) ||
        (r.installedVersion && r.installedVersion.toLowerCase().includes(q))
      );
    });
  }, [normalizedRecords, activeTab, searchQuery]);

  const tabOptions = [
    { id: 'all', label: 'All Packages', count: normalizedRecords.length },
    { id: 'scored', label: 'Scored', count: scoredCount, color: 'text-emerald-600 dark:text-emerald-400' },
    { id: 'lookup_failed', label: 'Lookup Failed', count: failedLookupCount, color: failedLookupCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400' },
    { id: 'unresolved_version', label: 'Unresolved', count: unresolvedVersionCount, color: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/20 shadow-glow-sm">
              <Clock className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  LibYear Freshness
                </h2>
                {isSimulatedActive && (
                  <span className="text-xs font-mono bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Baseline Project Data</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Measure technical lag and release age between installed and latest upstream packages
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {failedLookupCount > 0 && (
              <motion.button
                type="button"
                onClick={() => handleRunFreshnessAnalysis(true)}
                disabled={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive}
                whileHover={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive ? {} : { scale: 1.02 }}
                whileTap={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive ? {} : { scale: 0.98 }}
                title="Retry failed registry lookups while keeping successful results"
                className="flex items-center space-x-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3.5 py-2.5 rounded-xl transition shadow-2xs duration-150"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying...' : `Retry Failed (${failedLookupCount})`}</span>
              </motion.button>
            )}

            <motion.button
              type="button"
              onClick={() => handleRunFreshnessAnalysis(false)}
              disabled={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive}
              whileHover={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive ? {} : { scale: 1.02 }}
              whileTap={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive ? {} : { scale: 0.98 }}
              title={isSimulatedActive ? 'Reset simulation before running freshness analysis on baseline' : ''}
              className="flex items-center space-x-2 text-sm font-semibold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl transition shadow-glow-sm duration-200"
            >
              <Clock className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Computing Registry Timestamps...' : 'Analyze LibYear Lag'}</span>
            </motion.button>
          </div>
        </div>

        {isSimulatedActive && (
          <div className="flex items-start space-x-2.5 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3.5 rounded-xl border border-amber-200 dark:border-amber-500/25">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <span className="leading-relaxed">
              <strong>What-If Simulation Active:</strong> Displayed freshness metrics correspond to the verified <strong>baseline analysis ({analysisResult?.project_name})</strong>, not temporary in-memory simulation mutations. Scan actions are locked until the simulation is reset.
            </span>
          </div>
        )}

        {failedLookupCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3.5 rounded-xl border border-amber-200 dark:border-amber-500/25">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>{failedLookupCount} package lookup{failedLookupCount > 1 ? 's' : ''} timed out or failed.</strong> Successfully scored packages are preserved. Click "Retry Failed" to re-fetch without clearing valid scores.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRunFreshnessAnalysis(true)}
              disabled={isAnalyzing || isRetrying || isSimulatedActive}
              className="flex items-center space-x-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl transition shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>Retry Failed Lookups</span>
            </button>
          </div>
        )}

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

        {/* Freshness Metric Counters */}
        {freshnessResult && normalizedRecords.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 pt-1">
              <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Total Project Lag</div>
                <div className="text-3xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono mt-1">
                  <AnimatedCounter value={totalLibYear} decimals={2} /> <span className="text-sm text-slate-500 dark:text-slate-400 font-sans font-normal">yrs</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Cumulative debt</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Average Package Lag</div>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
                  <AnimatedCounter value={avgLibYear} decimals={2} /> <span className="text-sm text-slate-500 dark:text-slate-400 font-sans font-normal">yrs</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">&divide; {scoredCount} scored pkgs</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Scored Packages</div>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                  <AnimatedCounter value={scoredCount} />
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-0.5">Verified timestamps</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Lookup Failed</div>
                <div className={`text-3xl font-extrabold font-mono mt-1 ${failedLookupCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                  <AnimatedCounter value={failedLookupCount} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Timeout / network err</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Unresolved Versions</div>
                <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">
                  <AnimatedCounter value={unresolvedVersionCount} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Ranges / missing lock</div>
              </div>
            </div>

            {/* Methodology & Scoring Denominator Explanation */}
            <div className="bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 flex items-start space-x-3">
              <HelpCircle className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Scoring Denominator & Methodology
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs sm:text-[13px]">
                  Average package lag is strictly calculated across the <strong className="text-emerald-600 dark:text-emerald-400">{scoredCount} scored packages</strong> with verified npm registry release dates ({Number(totalLibYear).toFixed(2)} yrs &divide; {scoredCount} = <strong className="text-slate-900 dark:text-white">{Number(avgLibYear).toFixed(2)} yrs/pkg</strong>). Unresolved packages ({unresolvedVersionCount}) and failed lookups ({failedLookupCount}) are excluded from the denominator to prevent artificial lag dilution.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LibYear Workspace */}
      {isLoadingPersisted || isAnalyzing ? (
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-8 space-y-4 shadow-2xs dark:shadow-card">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {isAnalyzing ? 'Querying NPM registry release dates to compute technical lag...' : 'Hydrating persisted freshness records for this snapshot...'}
            </span>
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton height="65px" />
            <Skeleton height="65px" />
            <Skeleton height="65px" />
          </div>
        </div>
      ) : (!freshnessResult || normalizedRecords.length === 0) ? (
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card">
          <div className="p-3.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-2xl w-fit mx-auto border border-cyan-500/20">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">No LibYear Freshness Scan Performed Yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Click <strong>"Analyze LibYear Lag"</strong> above to query release timestamps from npm registry archives and evaluate dependency aging.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls: Filter Pills & Search Bar */}
          <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-4.5 space-y-3 shadow-2xs dark:shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Category Filter Pills with animated layout pill */}
              <div className="flex flex-wrap items-center gap-2">
                {tabOptions.map((tab) => {
                  const isSelected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center space-x-2 ${
                        isSelected
                          ? 'text-white shadow-glow-sm'
                          : 'bg-slate-100 dark:bg-[#070b14] hover:bg-slate-200 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.05]'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="activeFreshnessTab"
                          className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-teal-600 rounded-xl"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                      <span className={`relative z-10 text-xs px-2 py-0.5 rounded-full font-mono ${
                        isSelected ? 'bg-black/30 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by package name or version..."
                  className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition"
                />
              </div>
            </div>

            {isSimulatedActive && (
              <div className="text-xs sm:text-[13px] text-indigo-700 dark:text-indigo-300 flex items-center space-x-1.5 pt-1 border-t border-slate-200/80 dark:border-white/[0.04]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Showing baseline manifest packages. Simulation changes are isolated.</span>
              </div>
            )}
          </div>

          {/* Package Cards */}
          {filteredRecords.length === 0 ? (
            <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-10 text-center text-slate-500 dark:text-slate-400 shadow-2xs dark:shadow-card">
              <p className="text-sm">No packages match the selected filter or search query.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((pkg) => {
                const lag = pkg.libyear !== null ? pkg.libyear : 0;
                const isHighLag = lag >= 3.0;
                const isModLag = lag >= 1.0 && lag < 3.0;

                return (
                  <motion.div
                    key={pkg.packageName}
                    whileHover={shouldReduceMotion ? {} : { y: -1.5, transition: { duration: 0.15, ease: easeSoft } }}
                    className="bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] rounded-2xl p-4.5 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs dark:shadow-card transition-colors duration-200"
                  >
                    <div className="space-y-1.5 min-w-[220px]">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                          {pkg.packageName}
                        </span>
                        <span className={`text-sm font-mono px-2.5 py-0.5 rounded-md border ${
                          pkg.category === 'scored'
                            ? 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20'
                            : pkg.category === 'lookup_failed'
                            ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
                            : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                        }`}>
                          v{pkg.installedVersion}
                        </span>
                        {pkg.category === 'lookup_failed' && (
                          <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full">
                            Lookup Failed
                          </span>
                        )}
                        {pkg.category === 'unresolved_version' && (
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-full">
                            Unresolved
                          </span>
                        )}
                      </div>

                      {pkg.releaseDate ? (
                        <div className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span>Release Date: {new Date(pkg.releaseDate).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <div className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
                          <AlertCircle className={`w-3.5 h-3.5 ${pkg.category === 'lookup_failed' ? 'text-rose-500 dark:text-rose-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <span className={pkg.category === 'lookup_failed' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-400'}>
                            {pkg.reasonUnscored || (pkg.category === 'lookup_failed' ? 'Registry lookup timed out or failed' : 'Missing concrete installed version in manifest')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* LibYear Meter / Action */}
                    <div className="flex items-center space-x-4">
                      {pkg.category === 'scored' ? (
                        <div className="text-right space-y-1.5">
                          <div className="flex items-center justify-end space-x-2">
                            <span className={`text-xl font-bold font-mono ${
                              isHighLag ? 'text-rose-600 dark:text-rose-400' : isModLag ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {lag.toFixed(2)}
                            </span>
                            <span className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400">LibYears</span>
                          </div>
                          <div className="w-36 bg-slate-200 dark:bg-[#070b14] h-2.5 rounded-full overflow-hidden border border-slate-300 dark:border-white/[0.08]">
                            <motion.div
                              initial={shouldReduceMotion ? false : { width: 0 }}
                              animate={{ width: `${Math.min(100, (lag / 5.0) * 100)}%` }}
                              transition={{ duration: 0.45, ease: easeSoft }}
                              className={`h-full rounded-full ${
                                isHighLag ? 'bg-gradient-to-r from-amber-500 to-rose-500' : isModLag ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                            />
                          </div>
                        </div>
                      ) : pkg.category === 'lookup_failed' ? (
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRunFreshnessAnalysis(true)}
                            disabled={isAnalyzing || isRetrying || isSimulatedActive}
                            className="flex items-center space-x-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 px-3.5 py-1.5 rounded-xl transition"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                            <span>Retry</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="text-xs bg-slate-100 dark:bg-[#070b14] text-slate-600 dark:text-slate-400 px-3 py-1 rounded-xl border border-slate-200 dark:border-white/[0.06]">
                            Unscored
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
