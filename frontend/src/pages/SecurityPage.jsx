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
      const detail = err.response?.data?.detail || err.message || 'OSV security scan failed.';
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
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-xl border border-rose-500/20 shadow-glow-rose">
              <ShieldAlert className="w-6 h-6 text-rose-500 dark:text-rose-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Security Analysis
                </h2>
                {isSimulatedActive && (
                  <span className="text-xs font-mono bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Baseline Project Data</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
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
            className="flex items-center space-x-2 text-sm font-semibold bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl transition shadow-glow-rose duration-200"
          >
            <Search className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Querying OSV Registry API...' : 'Scan OSV Vulnerabilities'}</span>
          </motion.button>
        </div>

        {isSimulatedActive && (
          <div className="flex items-start space-x-2.5 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3.5 rounded-xl border border-amber-200 dark:border-amber-500/25">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
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
              className="flex items-start space-x-2.5 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/25 overflow-hidden"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security Metric Counters */}
        {securityResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1">
            <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Vulnerable Packages</div>
              <div className={`text-3xl font-extrabold font-mono mt-1 ${securityResult.vulnerable_packages_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                <AnimatedCounter value={securityResult.vulnerable_packages_count} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Has &ge;1 CVE advisory</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Total Advisories</div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
                <AnimatedCounter value={normalizedFindings.length} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Unique CVE / GHSA IDs</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Clean Packages</div>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                <AnimatedCounter value={cleanCount} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Zero published advisories</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-xl border border-slate-200/80 dark:border-white/[0.05]">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-500">Unresolved in OSV</div>
              <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">
                <AnimatedCounter value={unresolvedCount} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Custom prefix / range</div>
            </div>
          </div>
        )}
      </div>

      {/* Security Analysis Workspace */}
      {isLoadingPersisted || isScanning ? (
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-8 space-y-4 shadow-2xs dark:shadow-card">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
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
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card">
          <div className="p-3.5 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-2xl w-fit mx-auto border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">No Security Scan Performed Yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Click <strong>"Scan OSV Vulnerabilities"</strong> above to inspect package versions against the Open Source Vulnerabilities database.
            </p>
          </div>
        </div>
      ) : normalizedFindings.length === 0 ? (
        <div className="bg-white dark:bg-[#0f1422] border border-emerald-500/30 rounded-2xl p-8 text-center space-y-3 shadow-2xs dark:shadow-card max-w-xl mx-auto">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl w-fit mx-auto border border-emerald-500/25 shadow-glow-emerald">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300">No Known Vulnerabilities Found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
              All inspected dependencies returned clean records from the OSV database. Note: Clean API results indicate absence of published CVE advisories, not formal security proof.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Bar with Animated Pill */}
          <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-4.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs dark:shadow-card">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
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
                          : 'bg-slate-100 dark:bg-[#070b14] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/[0.05]'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="activeSecurityFilter"
                          className="absolute inset-0 bg-gradient-to-r from-rose-600 to-rose-700 rounded-xl shadow-glow-rose"
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
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search package name or CVE..."
                className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition"
              />
            </div>
          </div>

          {/* Advisories Grid / List */}
          <div className="space-y-3">
            {filteredFindings.map((finding, idx) => (
              <motion.div
                key={`${finding.packageName}-${finding.id}-${idx}`}
                whileHover={shouldReduceMotion ? {} : { y: -2, transition: { duration: 0.15, ease: easeSoft } }}
                className="bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-rose-300 dark:border-rose-500/30 hover:border-rose-400 dark:hover:border-rose-500/50 rounded-2xl p-5 sm:p-6 space-y-3.5 shadow-2xs dark:shadow-card transition-colors duration-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono text-base font-bold text-rose-700 dark:text-rose-300">
                      {finding.packageName}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      v{finding.version}
                    </span>
                    {isSimulatedActive && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans italic bg-slate-50 dark:bg-[#070b14] px-2 py-0.5 rounded border border-slate-200 dark:border-white/[0.04]">
                        Baseline Package
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono font-bold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-200 dark:border-cyan-500/20">
                      {finding.id}
                    </span>
                    {finding.severity && (
                      <span className="text-xs font-semibold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-500/30">
                        {finding.severity}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {finding.summary}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                  <div>
                    {finding.fixedVersions.length > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Patched in: <span className="font-mono text-slate-900 dark:text-white font-semibold">{finding.fixedVersions.join(', ')}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-xs">No specific fix version registered in advisory</span>
                    )}
                  </div>

                  {finding.references.length > 0 && (
                    <a
                      href={finding.references[0]?.url || finding.references[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 hover:underline text-sm font-medium"
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
            <div className="bg-white dark:bg-[#0f1422] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-5 text-sm space-y-2 shadow-2xs dark:shadow-card">
              <div className="flex items-center space-x-2 font-bold text-amber-700 dark:text-amber-400">
                <HelpCircle className="w-4 h-4" />
                <span>Unresolved / Unverified in OSV ({securityResult.unresolved_packages.length} packages):</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-[13px] leading-relaxed">
                The following packages could not be conclusively verified against OSV (e.g. non-registry packages, local modules, or custom scope prefixes):
              </p>
              <div className="font-mono text-slate-800 dark:text-slate-300 bg-slate-50 dark:bg-[#070b14] p-3 rounded-xl border border-slate-200 dark:border-white/[0.05] text-xs sm:text-[13px]">
                {securityResult.unresolved_packages.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
