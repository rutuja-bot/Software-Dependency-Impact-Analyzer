import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Filter,
  Layers,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { scanSecurity, getAnalysisSecurity } from '../services/api';

export default function SecurityPage() {
  const { 
    securityResult, 
    setSecurityResult, 
    analysisResult,
    isSimulatedActive 
  } = useAnalysis();

  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingPersisted, setIsLoadingPersisted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'high' | 'medium' | 'low'
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-fetch persisted security findings for loaded analysis snapshot if not already hydrated
  useEffect(() => {
    let isMounted = true;
    const fetchPersistedSecurity = async () => {
      if (!analysisResult?.analysis_id) return;
      if (securityResult && securityResult.analysis_id === analysisResult.analysis_id) {
        return;
      }
      setIsLoadingPersisted(true);
      setErrorMsg(null);
      try {
        const data = await getAnalysisSecurity(analysisResult.analysis_id);
        if (isMounted) {
          if (data && (data.findings?.length > 0 || data.total_findings !== undefined)) {
            setSecurityResult({
              ...data,
              analysis_id: analysisResult.analysis_id
            });
          }
        }
      } catch (err) {
        if (isMounted && err.response?.status !== 404) {
          console.warn('Failed to load persisted security findings:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPersisted(false);
        }
      }
    };

    fetchPersistedSecurity();
    return () => { isMounted = false; };
  }, [analysisResult?.analysis_id, securityResult?.analysis_id, setSecurityResult]);

  const handleRunSecurityScan = async () => {
    if (isSimulatedActive) {
      setErrorMsg('Cannot trigger security scan while a What-If simulation is active. Please reset to baseline first.');
      return;
    }
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const res = await scanSecurity(analysisResult?.analysis_id);
      setSecurityResult({
        ...res,
        analysis_id: analysisResult?.analysis_id
      });
    } catch (err) {
      console.error('Security scan failed', err);
      const detail = err.response?.data?.detail || err.message || 'OSV security scan failed.';
      setErrorMsg(detail);
    } finally {
      setIsScanning(false);
    }
  };

  // Normalize findings list regardless of whether it came from /security/scan (results) or /analyses/{id}/security (findings)
  const normalizedFindings = useMemo(() => {
    if (!securityResult) return [];

    // Case 1: Fresh scan response ({ results: [...] })
    if (securityResult.results) {
      const items = [];
      securityResult.results.forEach((pkg) => {
        if (pkg.status === 'vulnerable' && pkg.vulnerabilities) {
          pkg.vulnerabilities.forEach((v) => {
            items.push({
              id: v.id,
              packageName: pkg.package_name,
              version: pkg.version,
              summary: v.summary || 'No advisory summary provided.',
              severity: v.severity || 'UNKNOWN',
              fixedVersions: v.fixed_versions || [],
              references: v.references || []
            });
          });
        }
      });
      return items;
    }

    // Case 2: Persisted history response ({ findings: [...] })
    if (securityResult.findings) {
      return securityResult.findings
        .filter(f => f.scan_status === 'vulnerable')
        .map(f => ({
          id: f.vuln_id,
          packageName: f.package_name,
          version: f.package_version,
          summary: f.summary || 'No advisory summary provided.',
          severity: f.severity || 'UNKNOWN',
          fixedVersions: f.fixed_versions || [],
          references: f.references || []
        }));
    }

    return [];
  }, [securityResult]);

  // Filtered Findings
  const filteredFindings = useMemo(() => {
    return normalizedFindings.filter((f) => {
      // Severity check
      if (severityFilter !== 'all') {
        const sev = (f.severity || '').toLowerCase();
        if (severityFilter === 'high' && !sev.includes('high') && !sev.includes('critical') && !sev.includes('cvss:3') && !sev.includes('cvss:4')) {
          return false;
        }
        if (severityFilter === 'medium' && !sev.includes('medium') && !sev.includes('moderate')) {
          return false;
        }
        if (severityFilter === 'low' && !sev.includes('low')) {
          return false;
        }
      }

      // Search query check
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = f.packageName.toLowerCase().includes(q);
        const matchesId = f.id.toLowerCase().includes(q);
        const matchesSummary = f.summary.toLowerCase().includes(q);
        return matchesName || matchesId || matchesSummary;
      }

      return true;
    });
  }, [normalizedFindings, severityFilter, searchQuery]);

  const unresolvedCount = useMemo(() => {
    if (securityResult?.unresolved_packages) {
      return securityResult.unresolved_packages.length;
    }
    if (securityResult?.findings) {
      const unresolvedNames = new Set(
        securityResult.findings
          .filter(f => f.scan_status === 'unresolved' || f.scan_status === 'error')
          .map(f => f.package_name)
      );
      return unresolvedNames.size;
    }
    return securityResult?.unresolved_packages_count || 0;
  }, [securityResult]);

  const cleanCount = useMemo(() => {
    if (securityResult?.clean_packages_count !== undefined) {
      return securityResult.clean_packages_count;
    }
    const total = analysisResult?.stats?.total_packages || 0;
    const vuln = securityResult?.vulnerable_packages_count || 0;
    return Math.max(0, total - vuln - unresolvedCount);
  }, [securityResult, analysisResult, unresolvedCount]);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Security Intelligence & OSV Vulnerability Scanning
                </h2>
                {isSimulatedActive && (
                  <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Baseline Project Data</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Matches dependencies against Google's Open Source Vulnerabilities database
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunSecurityScan}
            disabled={isScanning || !analysisResult || isSimulatedActive}
            title={isSimulatedActive ? 'Reset simulation before running security scan on baseline' : ''}
            className="flex items-center space-x-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg transition shadow-sm"
          >
            <Search className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Querying OSV API...' : 'Scan OSV Vulnerabilities'}</span>
          </button>
        </div>

        {isSimulatedActive && (
          <div className="flex items-center space-x-2 text-xs text-amber-300 bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>What-If Simulation Active:</strong> Displayed vulnerability findings correspond to the verified <strong>baseline analysis ({analysisResult?.project_name})</strong>, not temporary in-memory simulation mutations. Scan actions are locked until the simulation is reset.
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Security Metric Counters */}
        {securityResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
              <div className="text-[11px] text-slate-400">Vulnerable Packages</div>
              <div className={`text-xl font-bold ${securityResult.vulnerable_packages_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {securityResult.vulnerable_packages_count}
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
              <div className="text-[11px] text-slate-400">Total Advisories</div>
              <div className="text-xl font-bold text-white">
                {normalizedFindings.length}
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
              <div className="text-[11px] text-slate-400">Clean Packages</div>
              <div className="text-xl font-bold text-emerald-400">
                {cleanCount}
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/80">
              <div className="text-[11px] text-slate-400">Unresolved / Unverified</div>
              <div className="text-xl font-bold text-amber-400">
                {unresolvedCount}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security Analysis Workspace */}
      {isLoadingPersisted ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-300">Loading persisted security findings for this snapshot...</p>
        </div>
      ) : !securityResult ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400 space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-slate-500" />
          <h3 className="text-base font-semibold text-slate-200">No Security Scan Performed Yet</h3>
          <p className="text-xs max-w-md mx-auto">
            Click <strong>"Scan OSV Vulnerabilities"</strong> above to inspect package versions against the Open Source Vulnerabilities database.
          </p>
        </div>
      ) : normalizedFindings.length === 0 ? (
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-6 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
          <h3 className="text-base font-bold text-emerald-300">No Known Vulnerabilities Found</h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            All inspected dependencies returned clean records from the OSV database. Note: Clean API results indicate absence of published CVE advisories, not formal security proof.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-300">
                {isSimulatedActive ? 'Baseline Vulnerability Filter:' : 'Filter Severity:'}
              </span>
              {['all', 'high', 'medium', 'low'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSeverityFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-lg capitalize transition font-medium ${
                    severityFilter === f
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search package or CVE ID..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Advisories Grid / List */}
          <div className="space-y-3">
            {filteredFindings.map((finding, idx) => (
              <div 
                key={`${finding.packageName}-${finding.id}-${idx}`}
                className="bg-slate-800/80 border border-rose-600/30 rounded-xl p-4 space-y-3 shadow-sm hover:border-rose-500/50 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-bold text-rose-300">
                      {finding.packageName}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      v{finding.version}
                    </span>
                    {isSimulatedActive && (
                      <span className="text-[10px] text-slate-400 font-sans italic bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                        Baseline Package
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                      {finding.id}
                    </span>
                    {finding.severity && (
                      <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                        {finding.severity}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {finding.summary}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                  <div>
                    {finding.fixedVersions.length > 0 ? (
                      <span className="text-emerald-400 font-medium">
                        Fixed in: <span className="font-mono">{finding.fixedVersions.join(', ')}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">No specific fix version registered</span>
                    )}
                  </div>

                  {finding.references.length > 0 && (
                    <a
                      href={finding.references[0]?.url || finding.references[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1 text-sky-400 hover:text-sky-300 hover:underline text-xs"
                    >
                      <span>Official Advisory</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Unresolved / Unverified Packages Section */}
          {securityResult.unresolved_packages && securityResult.unresolved_packages.length > 0 && (
            <div className="bg-slate-800/40 border border-amber-500/30 rounded-xl p-4 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-400">
                <HelpCircle className="w-4 h-4" />
                <span>Unresolved / Unverified in OSV ({securityResult.unresolved_packages.length} packages):</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                The following packages could not be conclusively verified against OSV (e.g. non-registry, transient query, or custom prefix):
              </p>
              <div className="font-mono text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-700/60 text-[11px]">
                {securityResult.unresolved_packages.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
