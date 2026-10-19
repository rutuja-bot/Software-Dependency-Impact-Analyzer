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
  AlertCircle
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { analyzeFreshness, getAnalysisFreshness } from '../services/api';

export default function FreshnessPage() {
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

  // Auto-fetch persisted freshness records for loaded analysis snapshot if not already hydrated
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

  // Helper to categorize records into 'scored', 'lookup_failed', or 'unresolved_version'
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

  // Normalize package records whether from /freshness/analyze (results) or /analyses/{id}/freshness (records)
  const normalizedRecords = useMemo(() => {
    if (!freshnessResult) return [];

    // Case 1: Live analysis response ({ results: [...] })
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

    // Case 2: Persisted history response ({ records: [...] })
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

    // Case 3: Fallback if named packages
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
      // Tab filter
      if (activeTab === 'scored' && r.category !== 'scored') return false;
      if (activeTab === 'lookup_failed' && r.category !== 'lookup_failed') return false;
      if (activeTab === 'unresolved_version' && r.category !== 'unresolved_version') return false;

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.packageName.toLowerCase().includes(q) || 
        (r.installedVersion && r.installedVersion.toLowerCase().includes(q))
      );
    });
  }, [normalizedRecords, activeTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg">
              <Clock className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Dependency Freshness & LibYear Technical Lag Analysis
                </h2>
                {isSimulatedActive && (
                  <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Baseline Project Data</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Measures the duration (in years) between currently installed releases and latest available package versions
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {failedLookupCount > 0 && (
              <button
                type="button"
                onClick={() => handleRunFreshnessAnalysis(true)}
                disabled={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive}
                title="Retry failed registry lookups while keeping successful results"
                className="flex items-center space-x-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white px-3.5 py-2 rounded-lg transition shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying...' : `Retry Failed (${failedLookupCount})`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleRunFreshnessAnalysis(false)}
              disabled={isAnalyzing || isRetrying || !analysisResult || isSimulatedActive}
              title={isSimulatedActive ? 'Reset simulation before running freshness analysis on baseline' : ''}
              className="flex items-center space-x-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg transition shadow-sm"
            >
              <Clock className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Calculating LibYears...' : 'Analyze LibYear Lag'}</span>
            </button>
          </div>
        </div>

        {isSimulatedActive && (
          <div className="flex items-center space-x-2 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>What-If Simulation Active:</strong> Displayed freshness metrics correspond to the verified <strong>baseline analysis ({analysisResult?.project_name})</strong>, not temporary in-memory simulation mutations. Scan actions are locked until the simulation is reset.
            </span>
          </div>
        )}

        {failedLookupCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>{failedLookupCount} package lookup{failedLookupCount > 1 ? 's' : ''} timed out or failed.</strong> Successfully scored packages are preserved. Click "Retry Failed" to re-fetch without clearing valid scores.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleRunFreshnessAnalysis(true)}
              disabled={isAnalyzing || isRetrying || isSimulatedActive}
              className="flex items-center space-x-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying Failed Lookups...' : `Retry Failed Lookups (${failedLookupCount})`}</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Freshness Metric Counters */}
        {freshnessResult && normalizedRecords.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
                <div className="text-[11px] text-slate-400">Total Project Lag</div>
                <div className="text-xl font-bold text-sky-400 font-mono">
                  {Number(totalLibYear).toFixed(2)} <span className="text-xs text-slate-400 font-sans font-normal">years</span>
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
                <div className="text-[11px] text-slate-400">Average Package Lag</div>
                <div className="text-xl font-bold text-white font-mono">
                  {Number(avgLibYear).toFixed(2)} <span className="text-xs text-slate-400 font-sans font-normal">years</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ÷ {scoredCount} scored pkgs
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
                <div className="text-[11px] text-slate-400">Scored Packages</div>
                <div className="text-xl font-bold text-emerald-400">
                  {scoredCount}
                </div>
                <div className="text-[10px] text-emerald-500/80 mt-0.5">
                  Valid timestamps
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
                <div className="text-[11px] text-slate-400">Lookup Failed</div>
                <div className={`text-xl font-bold ${failedLookupCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {failedLookupCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Timeout / network err
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
                <div className="text-[11px] text-slate-400">Unresolved Versions</div>
                <div className="text-xl font-bold text-amber-400">
                  {unresolvedVersionCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Ranges / missing
                </div>
              </div>
            </div>

            {/* Methodology & Scoring Denominator Explanation */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 text-xs text-slate-300 flex items-start space-x-2.5">
              <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-200">
                  Scoring Denominator & Methodology
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Average package lag is strictly calculated across the <strong className="text-emerald-400">{scoredCount} scored packages</strong> with verified npm registry release dates ({Number(totalLibYear).toFixed(2)} yrs ÷ {scoredCount} = <strong className="text-white">{Number(avgLibYear).toFixed(2)} yrs/pkg</strong>). Unresolved packages ({unresolvedVersionCount}) and failed lookups ({failedLookupCount}) are excluded from the denominator to prevent artificial lag dilution.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LibYear Workspace */}
      {isLoadingPersisted ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-300">Loading persisted freshness records for this snapshot...</p>
        </div>
      ) : (!freshnessResult || normalizedRecords.length === 0) ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
          <Clock className="w-10 h-10 mx-auto text-slate-500" />
          <h3 className="text-base font-semibold text-slate-200">No LibYear Freshness Scan Performed Yet</h3>
          <p className="text-xs max-w-md mx-auto">
            Click <strong>"Analyze LibYear Lag"</strong> above to query release timestamps from npm registry archives and evaluate dependency aging.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls: Filter Pills & Search Bar */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: 'All Packages', count: normalizedRecords.length },
                  { id: 'scored', label: 'Scored', count: scoredCount, color: 'text-emerald-400' },
                  { id: 'lookup_failed', label: 'Lookup Failed', count: failedLookupCount, color: failedLookupCount > 0 ? 'text-rose-400' : 'text-slate-400' },
                  { id: 'unresolved_version', label: 'Unresolved', count: unresolvedVersionCount, color: 'text-amber-400' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${
                      activeTab === tab.id
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-900/60 hover:bg-slate-700/50 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      activeTab === tab.id ? 'bg-sky-800 text-sky-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by package name..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {isSimulatedActive && (
              <div className="text-[11px] text-indigo-300 flex items-center space-x-1.5 pt-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Showing baseline manifest packages. Simulation changes are isolated.</span>
              </div>
            )}
          </div>

          {/* Package Cards */}
          {filteredRecords.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400">
              <p className="text-xs">No packages match the selected filter or search query.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((pkg) => {
                const lag = pkg.libyear !== null ? pkg.libyear : 0;
                const isHighLag = lag >= 3.0;
                const isModLag = lag >= 1.0 && lag < 3.0;

                return (
                  <div 
                    key={pkg.packageName}
                    className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="space-y-1.5 min-w-[220px]">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-white">
                          {pkg.packageName}
                        </span>
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                          pkg.category === 'scored' 
                            ? 'text-teal-400 bg-teal-500/10 border-teal-500/20'
                            : pkg.category === 'lookup_failed'
                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        }`}>
                          v{pkg.installedVersion}
                        </span>
                        {pkg.category === 'lookup_failed' && (
                          <span className="text-[10px] font-semibold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.5 rounded">
                            Lookup Failed
                          </span>
                        )}
                        {pkg.category === 'unresolved_version' && (
                          <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            Unresolved
                          </span>
                        )}
                      </div>

                      {pkg.releaseDate ? (
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>Released: {new Date(pkg.releaseDate).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <AlertCircle className={`w-3 h-3 ${pkg.category === 'lookup_failed' ? 'text-rose-400' : 'text-amber-400'}`} />
                          <span className={pkg.category === 'lookup_failed' ? 'text-rose-300' : 'text-slate-400'}>
                            {pkg.reasonUnscored || (pkg.category === 'lookup_failed' ? 'Registry lookup timed out or failed' : 'Missing concrete installed version')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* LibYear Meter / Action */}
                    <div className="flex items-center space-x-4">
                      {pkg.category === 'scored' ? (
                        <div className="text-right space-y-1">
                          <div className="flex items-center justify-end space-x-1.5">
                            <span className={`text-base font-bold font-mono ${
                              isHighLag ? 'text-rose-400' : isModLag ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {lag.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-400">LibYears</span>
                          </div>
                          <div className="w-32 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-700">
                            <div 
                              className={`h-full rounded-full ${
                                isHighLag ? 'bg-rose-500' : isModLag ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, (lag / 5.0) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : pkg.category === 'lookup_failed' ? (
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleRunFreshnessAnalysis(true)}
                            disabled={isAnalyzing || isRetrying || isSimulatedActive}
                            className="flex items-center space-x-1 text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded transition"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                            <span>Retry</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="text-[11px] bg-slate-900 text-slate-400 px-2.5 py-1 rounded border border-slate-700">
                            Unscored
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
