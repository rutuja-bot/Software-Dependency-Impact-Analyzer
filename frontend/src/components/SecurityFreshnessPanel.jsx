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
    <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-5 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#26364D] pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2.5 bg-[#F05252]/10 text-[#F05252] rounded-xl border border-[#F05252]/20">
            <ShieldAlert className="w-5 h-5 text-[#F05252]" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-wide">
              Security Intelligence (OSV API) & Dependency Freshness (LibYear)
            </h2>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8]">
              Vulnerability identification and dependency technical lag scoring
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRunSecurityScan}
            disabled={isScanning || isSimulatedActive}
            title={isSimulatedActive ? 'Reset simulation before running security scan on baseline' : ''}
            className="w-full sm:w-auto justify-center flex items-center space-x-1.5 text-sm font-semibold bg-[#F05252] hover:bg-[#d94242] disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-xl transition shadow-sm"
          >
            <Search className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Querying OSV API...' : 'Scan OSV Vulnerabilities'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunFreshnessAnalysis}
            disabled={isAnalyzingFreshness || isSimulatedActive}
            title={isSimulatedActive ? 'Reset simulation before running freshness analysis on baseline' : ''}
            className="w-full sm:w-auto justify-center flex items-center space-x-1.5 text-sm font-semibold bg-[#4C8DCE] hover:bg-[#3b7bb8] disabled:opacity-50 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-xl transition shadow-sm"
          >
            <Clock className={`w-4 h-4 ${isAnalyzingFreshness ? 'animate-spin' : ''}`} />
            <span>{isAnalyzingFreshness ? 'Calculating LibYears...' : 'Analyze LibYear Lag'}</span>
          </button>
        </div>
      </div>

      {isSimulatedActive && (
        <div className="flex items-center space-x-2 text-sm text-[#F59E0B] bg-[#F59E0B]/10 p-3.5 rounded-xl border border-[#F59E0B]/30">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#F59E0B]" />
          <span>
            <strong>What-If Simulation Active:</strong> OSV security and LibYear freshness scans evaluate the persisted baseline analysis, not temporary simulated graph mutations. Reset simulation to scan the baseline graph.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center space-x-2 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Panels Grid: Security Results & Freshness Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* OSV Security Scan Column */}
        <div className="bg-slate-50 dark:bg-[#111C2E] border border-slate-200/80 dark:border-[#26364D] rounded-xl p-4.5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#26364D] pb-2.5">
            <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-[#F05252]" />
              <span>OSV Vulnerability Matches</span>
            </span>
            {securityResult && (
              <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full font-semibold border ${
                securityResult.vulnerable_packages_count > 0
                  ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30'
                  : 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
              }`}>
                {securityResult.vulnerable_packages_count} vulnerable / {securityResult.clean_packages_count} clean
              </span>
            )}
          </div>

          {!securityResult ? (
            <div className="text-center py-6 text-sm text-slate-500 dark:text-[#94A3B8]">
              Click <strong>"Scan OSV Vulnerabilities"</strong> to check installed package versions against Google's Open Source Vulnerabilities database.
            </div>
          ) : securityResult.vulnerable_packages_count === 0 ? (
            <div className="p-3.5 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl text-sm space-y-1.5 text-[#22C55E]">
              <div className="flex items-center space-x-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                <span>No Known Vulnerabilities Returned</span>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                All {securityResult.clean_packages_count} verified packages returned clean results from OSV. 
                <span className="italic block mt-0.5 text-slate-500 dark:text-[#64748B]">Note: Clean API results indicate absence of published advisories, not formal security proof.</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {securityResult.results.filter(r => r.status === 'vulnerable').map((r) => (
                <div key={r.package_name} className="bg-white dark:bg-[#172438] border border-[#F05252]/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#F05252] font-mono">
                      {r.package_name} <span className="text-slate-500 dark:text-[#94A3B8] font-normal">v{r.version}</span>
                    </span>
                    <span className="text-xs bg-[#F05252]/10 text-[#F05252] border border-[#F05252]/30 px-2 py-0.5 rounded-full font-semibold">
                      {r.vulnerabilities.length} advisory(s)
                    </span>
                  </div>

                  {r.vulnerabilities.map((v) => (
                    <div key={v.id} className="text-xs sm:text-[13px] bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-lg border border-slate-200 dark:border-[#26364D] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#19B6A4] font-mono">{v.id}</span>
                        {v.severity && (
                          <span className="text-xs bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 px-1.5 py-0.5 rounded">
                            {v.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700 dark:text-[#94A3B8] leading-relaxed">{v.summary || 'No summary provided.'}</p>
                      {v.fixed_versions.length > 0 && (
                        <div className="text-xs text-[#22C55E]">
                          Fixed in: <span className="font-mono">{v.fixed_versions.join(', ')}</span>
                        </div>
                      )}
                      {v.references.length > 0 && (
                        <a 
                          href={v.references[0].url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center space-x-1 text-xs text-[#4C8DCE] hover:underline pt-0.5"
                        >
                          <span>Advisory Reference</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {securityResult?.unresolved_packages.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-[#94A3B8] bg-slate-50 dark:bg-[#172438] p-2.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-0.5">
              <span className="font-semibold text-[#F59E0B]">Unresolved / Unverified ({securityResult.unresolved_packages.length}):</span>
              <div className="font-mono text-xs text-slate-500 dark:text-[#94A3B8] truncate">
                {securityResult.unresolved_packages.join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* LibYear Freshness Column */}
        <div className="bg-slate-50 dark:bg-[#111C2E] border border-slate-200/80 dark:border-[#26364D] rounded-xl p-4.5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#26364D] pb-2.5">
            <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2">
              <Clock className="w-4 h-4 text-[#4C8DCE]" />
              <span>LibYear Freshness & Technical Lag</span>
            </span>
            {freshnessResult && (
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full font-semibold bg-[#4C8DCE]/10 text-[#4C8DCE] border border-[#4C8DCE]/30">
                Total: {freshnessResult.project_total_libyear} yrs &bull; Avg: {freshnessResult.project_average_libyear} yrs
              </span>
            )}
          </div>

          {!freshnessResult ? (
            <div className="text-center py-6 text-sm text-slate-500 dark:text-[#94A3B8]">
              Click <strong>"Analyze LibYear Lag"</strong> to compute dependency age lag based on release timestamps.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Aggregate KPI */}
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-white dark:bg-[#172438] p-2.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
                  <span className="text-xs text-slate-500 dark:text-[#64748B] block uppercase font-bold tracking-wider">Project Total Lag</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-[#F1F5F9] font-mono">
                    {freshnessResult.project_total_libyear} <span className="text-xs font-normal text-slate-500 dark:text-[#94A3B8]">LibYears</span>
                  </span>
                </div>
                <div className="bg-white dark:bg-[#172438] p-2.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
                  <span className="text-xs text-slate-500 dark:text-[#64748B] block uppercase font-bold tracking-wider">Average Package Lag</span>
                  <span className="text-lg font-bold text-[#4C8DCE] font-mono">
                    {freshnessResult.project_average_libyear} <span className="text-xs font-normal text-slate-500 dark:text-[#94A3B8]">yrs/pkg</span>
                  </span>
                </div>
              </div>

              {/* Package lag list */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {freshnessResult.results.map((r) => (
                  <div key={r.package_name} className="flex items-center justify-between text-sm bg-white dark:bg-[#172438] px-3 py-2 rounded-lg border border-slate-200 dark:border-[#26364D]">
                    <span className="font-mono text-slate-800 dark:text-[#F1F5F9]">
                      {r.package_name} <span className="text-slate-500 dark:text-[#94A3B8] font-normal text-xs">v{r.version || '?'}</span>
                    </span>
                    {r.status === 'scored' ? (
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                        r.libyear > 3.0 ? 'bg-[#F05252]/10 text-[#F05252] border-[#F05252]/30' :
                        r.libyear > 1.0 ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30' :
                        'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
                      }`}>
                        {r.libyear} yrs
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-[#64748B] italic">unscored</span>
                    )}
                  </div>
                ))}
              </div>

              {freshnessResult.unscored_packages.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-[#94A3B8] italic">
                  * {freshnessResult.unscored_packages_count} package(s) unscored due to missing/unresolved registry release dates and excluded from average.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  );
}
