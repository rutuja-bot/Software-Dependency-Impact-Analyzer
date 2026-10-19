import React, { useState } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  ExternalLink, 
  RefreshCw,
  Search,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { scanSecurity, analyzeFreshness } from '../services/api';

export default function SecurityFreshnessPanel({ 
  onSecurityUpdate, 
  onFreshnessUpdate,
  securityResult,
  freshnessResult,
  isSimulatedActive = false
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzingFreshness, setIsAnalyzingFreshness] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleRunSecurityScan = async () => {
    if (isSimulatedActive) {
      setErrorMsg('Cannot trigger security scan while a What-If simulation is active. Please reset to baseline first.');
      return;
    }
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const res = await scanSecurity();
      onSecurityUpdate(res);
    } catch (err) {
      console.error('Security scan failed', err);
      const detail = err.response?.data?.detail || err.message || 'OSV security scan failed.';
      setErrorMsg(detail);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRunFreshnessAnalysis = async () => {
    if (isSimulatedActive) {
      setErrorMsg('Cannot trigger LibYear freshness analysis while a What-If simulation is active. Please reset to baseline first.');
      return;
    }
    setIsAnalyzingFreshness(true);
    setErrorMsg(null);
    try {
      const res = await analyzeFreshness();
      onFreshnessUpdate(res);
    } catch (err) {
      console.error('Freshness analysis failed', err);
      const detail = err.response?.data?.detail || err.message || 'LibYear analysis failed.';
      setErrorMsg(detail);
    } finally {
      setIsAnalyzingFreshness(false);
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Security Intelligence (OSV API) & Dependency Freshness (LibYear)
            </h2>
            <p className="text-xs text-slate-400">
              Vulnerability identification and dependency technical lag scoring
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRunSecurityScan}
            disabled={isScanning || isSimulatedActive}
            title={isSimulatedActive ? 'Reset simulation before running security scan on baseline' : ''}
            className="flex items-center space-x-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition shadow-sm"
          >
            <Search className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Querying OSV API...' : 'Scan OSV Vulnerabilities'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunFreshnessAnalysis}
            disabled={isAnalyzingFreshness || isSimulatedActive}
            title={isSimulatedActive ? 'Reset simulation before running freshness analysis on baseline' : ''}
            className="flex items-center space-x-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition shadow-sm"
          >
            <Clock className={`w-3.5 h-3.5 ${isAnalyzingFreshness ? 'animate-spin' : ''}`} />
            <span>{isAnalyzingFreshness ? 'Calculating LibYears...' : 'Analyze LibYear Lag'}</span>
          </button>
        </div>
      </div>

      {isSimulatedActive && (
        <div className="flex items-center space-x-2 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>What-If Simulation Active:</strong> OSV security and LibYear freshness scans evaluate the persisted baseline analysis, not temporary simulated graph mutations. Reset simulation to scan the baseline graph.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Panels Grid: Security Results & Freshness Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* OSV Security Scan Column */}
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>OSV Vulnerability Matches</span>
            </span>
            {securityResult && (
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                securityResult.vulnerable_packages_count > 0 
                  ? 'bg-rose-500/20 text-rose-300' 
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {securityResult.vulnerable_packages_count} vulnerable / {securityResult.clean_packages_count} clean
              </span>
            )}
          </div>

          {!securityResult ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Click <strong>"Scan OSV Vulnerabilities"</strong> to check installed package versions against Google's Open Source Vulnerabilities database.
            </div>
          ) : securityResult.vulnerable_packages_count === 0 ? (
            <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-xs space-y-1 text-emerald-300">
              <div className="flex items-center space-x-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>No Known Vulnerabilities Returned</span>
              </div>
              <p className="text-[11px] text-slate-400">
                All {securityResult.clean_packages_count} verified packages returned clean results from OSV. 
                <span className="italic block mt-0.5 text-slate-500">Note: Clean API results indicate absence of published advisories, not formal security proof.</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {securityResult.results.filter(r => r.status === 'vulnerable').map((r) => (
                <div key={r.package_name} className="bg-slate-800/90 border border-rose-600/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 font-mono">
                      {r.package_name} <span className="text-slate-400 font-normal">v{r.version}</span>
                    </span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-semibold">
                      {r.vulnerabilities.length} advisory(s)
                    </span>
                  </div>

                  {r.vulnerabilities.map((v) => (
                    <div key={v.id} className="text-[11px] bg-slate-900/80 p-2 rounded border border-slate-700/80 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-teal-400 font-mono">{v.id}</span>
                        {v.severity && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">
                            {v.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300">{v.summary || 'No summary provided.'}</p>
                      {v.fixed_versions.length > 0 && (
                        <div className="text-[10px] text-emerald-400">
                          Fixed in: <span className="font-mono">{v.fixed_versions.join(', ')}</span>
                        </div>
                      )}
                      {v.references.length > 0 && (
                        <a 
                          href={v.references[0].url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center space-x-1 text-[10px] text-sky-400 hover:underline pt-0.5"
                        >
                          <span>Advisory Reference</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {securityResult?.unresolved_packages.length > 0 && (
            <div className="text-[11px] text-slate-400 bg-slate-800/40 p-2 rounded border border-slate-700 space-y-0.5">
              <span className="font-semibold text-amber-400">Unresolved / Unverified ({securityResult.unresolved_packages.length}):</span>
              <div className="font-mono text-[10px] text-slate-400 truncate">
                {securityResult.unresolved_packages.join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* LibYear Freshness Column */}
        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>LibYear Freshness & Technical Lag</span>
            </span>
            {freshnessResult && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded font-semibold bg-sky-500/20 text-sky-300">
                Total: {freshnessResult.project_total_libyear} yrs &bull; Avg: {freshnessResult.project_average_libyear} yrs
              </span>
            )}
          </div>

          {!freshnessResult ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Click <strong>"Analyze LibYear Lag"</strong> to compute dependency age lag based on release timestamps.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Aggregate KPI */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase">Project Total Lag</span>
                  <span className="text-base font-bold text-white font-mono">
                    {freshnessResult.project_total_libyear} <span className="text-xs font-normal text-slate-400">LibYears</span>
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase">Average Package Lag</span>
                  <span className="text-base font-bold text-sky-400 font-mono">
                    {freshnessResult.project_average_libyear} <span className="text-xs font-normal text-slate-400">yrs/pkg</span>
                  </span>
                </div>
              </div>

              {/* Package lag list */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {freshnessResult.results.map((r) => (
                  <div key={r.package_name} className="flex items-center justify-between text-xs bg-slate-800/80 px-2.5 py-1.5 rounded border border-slate-700">
                    <span className="font-mono text-slate-200">
                      {r.package_name} <span className="text-slate-400 font-normal">v{r.version || '?'}</span>
                    </span>
                    {r.status === 'scored' ? (
                      <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                        r.libyear > 3.0 ? 'bg-rose-500/20 text-rose-300' :
                        r.libyear > 1.0 ? 'bg-amber-500/20 text-amber-300' :
                        'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {r.libyear} yrs
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">unscored</span>
                    )}
                  </div>
                ))}
              </div>

              {freshnessResult.unscored_packages.length > 0 && (
                <div className="text-[10px] text-slate-400 italic">
                  * {freshnessResult.unscored_packages_count} package(s) unscored due to missing/unresolved registry release dates and excluded from average.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
