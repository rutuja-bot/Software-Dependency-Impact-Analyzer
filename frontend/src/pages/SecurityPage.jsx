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
  Sparkles,
  Shield,
  Bug,
  Lock
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { scanSecurity, getAnalysisSecurity } from '../services/api';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AnimatedCounter, Skeleton, easeSoft } from '../utils/animations';

export default function SecurityPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    securityResult,
    setSecurityResult,
    analysisResult,
    isSimulatedActive
  } = useAnalysis();

  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingPersisted, setIsLoadingPersisted] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-fetch persisted security findings for loaded snapshot
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
      const isTimeout = err.code === 'ECONNABORTED' || (err.message && err.message.toLowerCase().includes('timeout'));
      const detail = isTimeout
        ? 'The OSV vulnerability scan timed out while communicating with the upstream database. Please check your internet connection and retry.'
        : (err.response?.data?.detail || err.message || 'OSV security scan failed.');
      setErrorMsg(detail);
    } finally {
      setIsScanning(false);
    }
  };

  // Normalize findings list
  const normalizedFindings = useMemo(() => {
    if (!securityResult) return [];

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

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'high', label: 'High / Critical' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-[#26364D] pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-[#F05252]/10 text-[#F05252] rounded-xl border border-[#F05252]/20 shadow-glow-rose">
              <ShieldAlert className="w-6 h-6 text-[#F05252]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                  Security Analysis
                </h2>
                {isSimulatedActive && (
                  <span className="text-xs font-mono bg-indigo-50 dark:bg-[#4C8DCE]/15 text-[#4C8DCE] border border-indigo-200 dark:border-[#4C8DCE]/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#4C8DCE]" />
                    <span>Baseline Project Data</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
                Scan dependencies against Google's Open Source Vulnerabilities (OSV) database
              </p>
            </div>
          </div>

          <motion.button
            type="button"
            onClick={handleRunSecurityScan}
            disabled={isScanning || !analysisResult || isSimulatedActive}
            whileHover={isScanning || !analysisResult || isSimulatedActive ? {} : { scale: 1.02 }}
            whileTap={isScanning || !analysisResult || isSimulatedActive ? {} : { scale: 0.98 }}
            title={isSimulatedActive ? 'Reset simulation before running security scan on baseline' : ''}
            className="w-full sm:w-auto justify-center flex items-center space-x-2 text-sm font-semibold bg-[#F05252] hover:bg-[#d94242] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl transition shadow-glow-rose duration-200"
          >
            <Search className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Querying OSV Registry API...' : 'Scan OSV Vulnerabilities'}</span>
          </motion.button>
        </div>

        {isSimulatedActive && (
          <div className="flex items-start space-x-2.5 text-sm text-[#F59E0B] bg-[#F59E0B]/10 p-3.5 rounded-xl border border-[#F59E0B]/30">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#F59E0B] mt-0.5" />
            <span className="leading-relaxed">
              <strong>What-If Simulation Active:</strong> Displayed vulnerability findings correspond to the verified <strong>baseline analysis ({analysisResult?.project_name})</strong>, not temporary in-memory simulation mutations. Scan actions are locked until the simulation is reset.
            </span>
          </div>
        )}

        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: easeSoft }}
              className="flex items-start space-x-2.5 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25 overflow-hidden"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#F05252] mt-0.5" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security Metric Counters */}
        {securityResult && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
            <div className="bg-slate-50 dark:bg-[#111C2E] p-4.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">Vulnerable Packages</div>
              <div className={`text-3xl font-extrabold font-mono mt-1 ${securityResult.vulnerable_packages_count > 0 ? 'text-[#F05252]' : 'text-[#22C55E]'}`}>
                <AnimatedCounter value={securityResult.vulnerable_packages_count} />
              </div>
              <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">Has &ge;1 CVE advisory</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#111C2E] p-4.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">Total Advisories</div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] font-mono mt-1">
                <AnimatedCounter value={normalizedFindings.length} />
              </div>
              <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">Unique CVE / GHSA IDs</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#111C2E] p-4.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">Clean Packages</div>
              <div className="text-3xl font-extrabold text-[#22C55E] font-mono mt-1">
                <AnimatedCounter value={cleanCount} />
              </div>
              <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">Zero published advisories</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#111C2E] p-4.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B]">Unresolved in OSV</div>
              <div className="text-3xl font-extrabold text-[#F59E0B] font-mono mt-1">
                <AnimatedCounter value={unresolvedCount} />
              </div>
              <div className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">Custom prefix / range</div>
            </div>
          </div>
        )}
      </div>

      {/* Security Analysis Workspace */}
      {isLoadingPersisted || isScanning ? (
        <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-8 space-y-4 shadow-2xs dark:shadow-card">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-[#F05252] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-slate-700 dark:text-[#F1F5F9]">
              {isScanning ? 'Querying OSV registry archives for package vulnerabilities...' : 'Hydrating persisted security findings for this snapshot...'}
            </span>
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton height="70px" />
            <Skeleton height="70px" />
            <Skeleton height="70px" />
          </div>
        </div>
      ) : !securityResult ? (
        <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-12 text-center text-slate-500 dark:text-[#94A3B8] space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card">
          <div className="p-3.5 bg-[#F05252]/10 text-[#F05252] rounded-2xl w-fit mx-auto border border-[#F05252]/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9]">No Security Scan Performed Yet</h3>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] max-w-md mx-auto leading-relaxed">
              Click <strong>"Scan OSV Vulnerabilities"</strong> above to inspect package versions against the Open Source Vulnerabilities database.
            </p>
          </div>
        </div>
      ) : normalizedFindings.length === 0 ? (
        <div className="bg-white dark:bg-[#172438] border border-[#22C55E]/30 rounded-2xl p-8 text-center space-y-3 shadow-2xs dark:shadow-card max-w-xl mx-auto">
          <div className="p-3 bg-[#22C55E]/10 text-[#22C55E] rounded-2xl w-fit mx-auto border border-[#22C55E]/25 shadow-glow-emerald">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-[#22C55E]">No Known Vulnerabilities Found</h3>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8] max-w-lg mx-auto leading-relaxed">
              All inspected dependencies returned clean records from the OSV database. Note: Clean API results indicate absence of published CVE advisories, not formal security proof.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Bar with Animated Pill */}
          <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs dark:shadow-card">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400 dark:text-[#94A3B8]" />
              <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9]">
                {isSimulatedActive ? 'Baseline Vulnerability Filter:' : 'Filter Severity:'}
              </span>
              <div className="flex items-center space-x-1.5">
                {filterTabs.map((tab) => {
                  const isSelected = severityFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSeverityFilter(tab.id)}
                      className={`relative text-sm px-3.5 py-1.5 rounded-xl font-medium transition duration-150 ${
                        isSelected
                          ? 'text-white font-semibold'
                          : 'bg-slate-100 dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#26364D]'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="activeSecurityFilter"
                          className="absolute inset-0 bg-[#F05252] rounded-xl shadow-glow-rose"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search package name or CVE..."
                className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#F05252]/60 transition"
              />
            </div>
          </div>

          {/* Advisories Grid / List */}
          <div className="space-y-3">
            {filteredFindings.map((finding, idx) => (
              <motion.div
                key={`${finding.packageName}-${finding.id}-${idx}`}
                whileHover={shouldReduceMotion ? {} : { y: -2, transition: { duration: 0.15, ease: easeSoft } }}
                className="bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-[#F05252]/30 hover:border-[#F05252]/60 rounded-2xl p-5 sm:p-6 space-y-3.5 shadow-2xs dark:shadow-card transition-colors duration-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-[#26364D] pb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono text-base font-bold text-[#F05252]">
                      {finding.packageName}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-[#94A3B8] font-mono bg-slate-100 dark:bg-[#111C2E] px-2.5 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
                      v{finding.version}
                    </span>
                    {isSimulatedActive && (
                      <span className="text-xs text-slate-500 dark:text-[#94A3B8] font-sans italic bg-slate-50 dark:bg-[#111C2E] px-2 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
                        Baseline Package
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono font-bold text-[#19B6A4] bg-[#19B6A4]/10 px-3 py-1 rounded-full border border-[#19B6A4]/30">
                      {finding.id}
                    </span>
                    {finding.severity && (
                      <span className="text-xs font-semibold bg-[#F59E0B]/10 text-[#F59E0B] px-3 py-1 rounded-full border border-[#F59E0B]/30">
                        {finding.severity}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm sm:text-[15px] text-slate-700 dark:text-[#94A3B8] leading-relaxed">
                  {finding.summary}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm pt-2 border-t border-slate-100 dark:border-[#26364D]">
                  <div>
                    {finding.fixedVersions.length > 0 ? (
                      <span className="text-[#22C55E] font-medium">
                        Patched in: <span className="font-mono text-slate-900 dark:text-[#F1F5F9] font-semibold">{finding.fixedVersions.join(', ')}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-[#64748B] italic text-xs">No specific fix version registered in advisory</span>
                    )}
                  </div>

                  {finding.references.length > 0 && (
                    <a
                      href={finding.references[0]?.url || finding.references[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 text-[#4C8DCE] hover:underline text-sm font-medium"
                    >
                      <span>Official Advisory</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Unresolved / Unverified Packages Section */}
          {securityResult.unresolved_packages && securityResult.unresolved_packages.length > 0 && (
            <div className="bg-white dark:bg-[#172438] border border-[#F59E0B]/30 rounded-2xl p-5 text-sm space-y-2 shadow-2xs dark:shadow-card">
              <div className="flex items-center space-x-2 font-bold text-[#F59E0B]">
                <HelpCircle className="w-4 h-4" />
                <span>Unresolved / Unverified in OSV ({securityResult.unresolved_packages.length} packages):</span>
              </div>
              <p className="text-slate-500 dark:text-[#94A3B8] text-xs sm:text-[13px] leading-relaxed">
                The following packages could not be conclusively verified against OSV (e.g. non-registry packages, local modules, or custom scope prefixes):
              </p>
              <div className="font-mono text-slate-800 dark:text-[#F1F5F9] bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200 dark:border-[#26364D] text-xs sm:text-[13px]">
                {securityResult.unresolved_packages.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
