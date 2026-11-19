import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Clock,
  Flame,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { getProjectRisk, scanSecurity, analyzeFreshness } from '../services/api';
import { formatRiskScore } from '../utils/risk';
import SecurityPage from './SecurityPage';
import FreshnessPage from './FreshnessPage';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function RiskPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    analysisResult,
    currentAnalysisId,
    securityResult,
    setSecurityResult,
    freshnessResult,
    setFreshnessResult
  } = useAnalysis();

  const [activeTab, setActiveTab] = useState('risk'); // 'risk' | 'security' | 'freshness'
  const [projectRisk, setProjectRisk] = useState(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;
    if (analysisResult) {
      setIsRiskLoading(true);
      getProjectRisk(currentAnalysisId || analysisResult?.analysis_id)
        .then(res => {
          if (isMounted) setProjectRisk(res);
        })
        .catch(err => {
          console.warn("Failed to load project risk:", err);
        })
        .finally(() => {
          if (isMounted) setIsRiskLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [analysisResult, currentAnalysisId]);

  if (!analysisResult) {
    return (
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-10 text-center text-slate-500 dark:text-[#94A3B8] space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-2xl w-fit mx-auto border border-[#19B6A4]/20">
          <Flame className="w-8 h-8 text-[#19B6A4]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">No Active Project Analyzed</h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
            Please import or analyze a project manifest before evaluating composite dependency risk and security posture.
          </p>
        </div>
      </div>
    );
  }

  const getCategoryColor = (cat) => {
    switch (cat?.toLowerCase()) {
      case 'critical': return { bg: 'bg-[#F05252]/10', text: 'text-[#F05252]', border: 'border-[#F05252]/30', bar: 'bg-[#F05252]' };
      case 'high': return { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30', bar: 'bg-[#F59E0B]' };
      case 'moderate': return { bg: 'bg-[#4C8DCE]/10', text: 'text-[#4C8DCE]', border: 'border-[#4C8DCE]/30', bar: 'bg-[#4C8DCE]' };
      default: return { bg: 'bg-[#22C55E]/10', text: 'text-[#22C55E]', border: 'border-[#22C55E]/30', bar: 'bg-[#22C55E]' };
    }
  };

  const filteredPackages = (projectRisk?.all_package_risks || []).filter(p => {
    const matchesQuery = p.package_name.toLowerCase().includes(filterSearch.toLowerCase());
    const matchesCat = categoryFilter === 'all' || p.risk_category?.toLowerCase() === categoryFilter.toLowerCase();
    return matchesQuery && matchesCat;
  });

  const overallCatColor = getCategoryColor(projectRisk?.overall_category);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-sm">
              <Flame className="w-6 h-6 text-[#19B6A4]" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                Risk Analysis & Intelligence
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
                Consolidated 4-factor risk scoring, OSV vulnerability tracking, and LibYear freshness aging
              </p>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center space-x-2 bg-slate-100 dark:bg-[#111C2E] p-1.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
            <button
              onClick={() => setActiveTab('risk')}
              className={`py-2 px-4 rounded-lg text-sm font-bold transition ${
                activeTab === 'risk'
                  ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
              }`}
            >
              Risk Score (0–10)
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2 px-4 rounded-lg text-sm font-bold transition ${
                activeTab === 'security'
                  ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
              }`}
            >
              OSV Vulnerabilities
            </button>
            <button
              onClick={() => setActiveTab('freshness')}
              className={`py-2 px-4 rounded-lg text-sm font-bold transition ${
                activeTab === 'freshness'
                  ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
              }`}
            >
              LibYear Freshness
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: CONSOLIDATED 4-FACTOR RISK OVERVIEW */}
      {activeTab === 'risk' && (
        <div className="space-y-6">
          {/* Composite Project Risk Gauge & Breakdown */}
          {projectRisk ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Overall Project Score Card */}
              <div className={`bg-white dark:bg-[#172438] border ${overallCatColor.border} rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-4`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#94A3B8]">
                    Overall Project Risk
                  </span>
                  <span className={`text-xs uppercase font-bold font-mono px-3 py-1 rounded-full ${overallCatColor.bg} ${overallCatColor.text} border ${overallCatColor.border}`}>
                    {projectRisk.overall_category} Risk
                  </span>
                </div>
                <div className="flex items-baseline space-x-3">
                  <span className={`text-5xl font-black font-mono ${overallCatColor.text}`}>
                    {formatRiskScore(projectRisk.overall_score)}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-[#64748B]">/ 10</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                  {projectRisk.methodology_notes?.replace(/0-100/g, '0-10')}
                </p>
                <div className="pt-2 border-t border-slate-200 dark:border-[#26364D] grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 dark:text-[#64748B] block">Critical Packages:</span>
                    <span className="font-bold text-[#F05252] font-mono text-base">{projectRisk.critical_risk_packages_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-[#64748B] block">High Risk:</span>
                    <span className="font-bold text-[#F59E0B] font-mono text-base">{projectRisk.high_risk_packages_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-[#64748B] block">Moderate:</span>
                    <span className="font-bold text-[#4C8DCE] font-mono text-base">{projectRisk.moderate_risk_packages_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-[#64748B] block">Low:</span>
                    <span className="font-bold text-[#22C55E] font-mono text-base">{projectRisk.low_risk_packages_count}</span>
                  </div>
                </div>
              </div>

              {/* Four Factor Weight Distribution Cards (2 Cols) */}
              <div className="lg:col-span-2 bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B] block">
                    Scoring Model & Factor Breakdown (0.35V + 0.25F + 0.20I + 0.20C)
                  </span>
                  {projectRisk.peak_package_score && (
                    <span className="text-xs font-mono bg-slate-100 dark:bg-[#111C2E] px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-[#26364D] text-slate-600 dark:text-[#94A3B8]">
                      Peak Risk: <strong className="text-slate-900 dark:text-white">{formatRiskScore(projectRisk.peak_package_score)} / 10</strong> ({projectRisk.peak_package_name})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-[#F1F5F9]">
                      <span>1. Known Vulnerabilities</span>
                      <span className="font-mono text-[#F05252]">35% Weight</span>
                    </div>
                    {projectRisk.factors?.vulnerability && (
                      <div className="flex items-center justify-between text-xs font-mono py-1 border-y border-slate-200/60 dark:border-[#26364D]/60 text-slate-700 dark:text-[#94A3B8]">
                        <span>Score: <strong className="text-slate-900 dark:text-[#F1F5F9]">{formatRiskScore(projectRisk.factors.vulnerability.normalized_score)}</strong>/10</span>
                        <span className="text-[#F05252] font-semibold">+{(projectRisk.factors.vulnerability.weighted_score / 10).toFixed(2)} pts</span>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                      Integrates Google OSV database advisories with CVSS/severity normalization (Critical: 95, High: 75, Med: 50, Low: 25).
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-[#F1F5F9]">
                      <span>2. Dependency Freshness</span>
                      <span className="font-mono text-[#19B6A4]">25% Weight</span>
                    </div>
                    {projectRisk.factors?.freshness && (
                      <div className="flex items-center justify-between text-xs font-mono py-1 border-y border-slate-200/60 dark:border-[#26364D]/60 text-slate-700 dark:text-[#94A3B8]">
                        <span>Score: <strong className="text-slate-900 dark:text-[#F1F5F9]">{formatRiskScore(projectRisk.factors.freshness.normalized_score)}</strong>/10</span>
                        <span className="text-[#19B6A4] font-semibold">+{(projectRisk.factors.freshness.weighted_score / 10).toFixed(2)} pts</span>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                      Measures installed release timestamp delta in LibYears (5y+: 100, 3-5y: 75, 1-3y: 50, 0.25-1y: 25).
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-[#F1F5F9]">
                      <span>3. Downstream Blast Radius</span>
                      <span className="font-mono text-[#4C8DCE]">20% Weight</span>
                    </div>
                    {projectRisk.factors?.downstream_impact && (
                      <div className="flex items-center justify-between text-xs font-mono py-1 border-y border-slate-200/60 dark:border-[#26364D]/60 text-slate-700 dark:text-[#94A3B8]">
                        <span>Score: <strong className="text-slate-900 dark:text-[#F1F5F9]">{formatRiskScore(projectRisk.factors.downstream_impact.normalized_score)}</strong>/10</span>
                        <span className="text-[#4C8DCE] font-semibold">+{(projectRisk.factors.downstream_impact.weighted_score / 10).toFixed(2)} pts</span>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                      Reverse graph reachability calculating the fraction of repository packages directly or transitively affected.
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-[#F1F5F9]">
                      <span>4. Structural Criticality</span>
                      <span className="font-mono text-sky-500">20% Weight</span>
                    </div>
                    {projectRisk.factors?.criticality && (
                      <div className="flex items-center justify-between text-xs font-mono py-1 border-y border-slate-200/60 dark:border-[#26364D]/60 text-slate-700 dark:text-[#94A3B8]">
                        <span>Score: <strong className="text-slate-900 dark:text-[#F1F5F9]">{formatRiskScore(projectRisk.factors.criticality.normalized_score)}</strong>/10</span>
                        <span className="text-sky-500 font-semibold">+{(projectRisk.factors.criticality.weighted_score / 10).toFixed(2)} pts</span>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                      Topological importance combining direct root dependency status (+30) with in-degree and out-degree coupling.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-[#94A3B8]">
              Calculating composite project risk score across dependency graph...
            </div>
          )}

          {/* Package Risk Score Registry Table */}
          <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#26364D] pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9]">
                  Package Risk Registry ({filteredPackages.length} packages)
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                  Explainable package scores sorted from highest to lowest risk
                </p>
              </div>

              {/* Filter and Search */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Search package..."
                    className="bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-[#F1F5F9] focus:outline-none focus:border-[#19B6A4]"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-[#F1F5F9] focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  <option value="critical">Critical (7.5–10)</option>
                  <option value="high">High (5.0–7.4)</option>
                  <option value="moderate">Moderate (2.5–4.9)</option>
                  <option value="low">Low (0–2.4)</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 dark:border-[#26364D] rounded-xl overflow-hidden">
                <thead className="bg-slate-100 dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Package</th>
                    <th className="py-2.5 px-3">Risk Score</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">OSV Vulnerability</th>
                    <th className="py-2.5 px-3">LibYear Lag</th>
                    <th className="py-2.5 px-3">Blast Radius</th>
                    <th className="py-2.5 px-3">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#26364D] font-mono">
                  {filteredPackages.map((pkg, idx) => {
                    const color = getCategoryColor(pkg.risk_category);
                    return (
                      <tr key={pkg.package_name} className="hover:bg-slate-50/50 dark:hover:bg-[#111C2E]/60 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-[#F1F5F9]">
                          {pkg.package_name}
                          {pkg.version && <span className="text-slate-400 font-normal ml-1">v{pkg.version}</span>}
                        </td>
                        <td className="py-2.5 px-3 font-extrabold text-sm">
                          <span className={color.text}>{formatRiskScore(pkg.risk_score)}</span>
                          <span className="text-slate-400 text-xs">/ 10</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
                            {pkg.risk_category?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-[#94A3B8]">
                          {pkg.vulnerabilities_count > 0 ? (
                            <span className="text-[#F05252] font-semibold flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#F05252]"></span>
                              <span>{pkg.vulnerabilities_count} CVEs ({pkg.max_vuln_severity})</span>
                            </span>
                          ) : (
                            <span className="text-[#22C55E]">Clean</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-[#94A3B8]">
                          {pkg.libyear_lag !== null ? `${pkg.libyear_lag.toFixed(2)}y` : 'Unscored'}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-[#94A3B8]">
                          {pkg.downstream_dependents_count} dependent(s)
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-500 dark:text-[#94A3B8] max-w-xs truncate" title={pkg.summary_explanation}>
                          {pkg.summary_explanation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OSV SECURITY ADVISORIES */}
      {activeTab === 'security' && (
        <SecurityPage />
      )}

      {/* TAB 3: LIBYEAR FRESHNESS & AGING */}
      {activeTab === 'freshness' && (
        <FreshnessPage />
      )}
    </div>
  );
}
