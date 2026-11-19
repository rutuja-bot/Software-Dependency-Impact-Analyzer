import React, { useState, useEffect } from 'react';
import {
  Target,
  ArrowRight,
  ShieldAlert,
  Layers,
  GitFork,
  Compass,
  Activity,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  Flame,
  Eye,
  Maximize2
} from 'lucide-react';
import { exploreImpact, getProjectRisk } from '../services/api';
import { formatRiskScore } from '../utils/risk';
import { useAnalysis } from '../context/AnalysisContext';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function NodeInspector({ selectedNode, nodes, onSelectAnother }) {
  const shouldReduceMotion = useReducedMotion();
  const { currentAnalysisId, setHighlightedImpact, highlightedImpact, securityResult, freshnessResult } = useAnalysis();

  const [activeTab, setActiveTab] = useState('impact'); // 'impact' | 'risk' | 'properties'
  const [impactData, setImpactData] = useState(null);
  const [isImpactLoading, setIsImpactLoading] = useState(false);
  const [packageRisk, setPackageRisk] = useState(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);

  const nodeObj = nodes.find((n) => n.name === selectedNode);

  // Automatically fetch impact and risk whenever selectedNode changes
  useEffect(() => {
    if (!selectedNode || !nodeObj) {
      setImpactData(null);
      setPackageRisk(null);
      setIsHighlighted(false);
      return;
    }

    let isMounted = true;

    const fetchImpactAndRisk = async () => {
      setIsImpactLoading(true);
      setIsRiskLoading(true);

      try {
        const impactRes = await exploreImpact(selectedNode, currentAnalysisId);
        if (isMounted) setImpactData(impactRes);
      } catch (err) {
        console.warn("Failed to fetch detailed impact", err);
      } finally {
        if (isMounted) setIsImpactLoading(false);
      }

      try {
        const riskRes = await getProjectRisk(currentAnalysisId);
        if (isMounted && riskRes && riskRes.all_package_risks) {
          const matched = riskRes.all_package_risks.find(p => p.package_name === selectedNode);
          if (matched) {
            setPackageRisk(matched);
          } else {
            // Compute deterministic client-side fallback
            setPackageRisk(buildFallbackRisk(selectedNode, nodeObj, nodes.length, securityResult, freshnessResult));
          }
        }
      } catch (err) {
        if (isMounted) {
          setPackageRisk(buildFallbackRisk(selectedNode, nodeObj, nodes.length, securityResult, freshnessResult));
        }
      } finally {
        if (isMounted) setIsRiskLoading(false);
      }
    };

    fetchImpactAndRisk();

    return () => {
      isMounted = false;
    };
  }, [selectedNode, currentAnalysisId]);

  // Client-side fallback risk score if API call is pending
  const buildFallbackRisk = (pkgName, node, totalNodes, secRes, freshRes) => {
    let vulnScore = 0;
    let vulnSev = 'CLEAN';
    let vulnCount = 0;
    if (secRes?.findings) {
      const pkgVulns = secRes.findings.filter(f => f.package_name === pkgName && f.scan_status === 'vulnerable');
      vulnCount = pkgVulns.length;
      if (vulnCount > 0) {
        const sevs = pkgVulns.map(v => (v.severity || 'LOW').toUpperCase());
        if (sevs.includes('CRITICAL')) { vulnScore = 95; vulnSev = 'CRITICAL'; }
        else if (sevs.includes('HIGH')) { vulnScore = 75; vulnSev = 'HIGH'; }
        else if (sevs.includes('MODERATE') || sevs.includes('MEDIUM')) { vulnScore = 50; vulnSev = 'MODERATE'; }
        else { vulnScore = 25; vulnSev = 'LOW'; }
      }
    }

    let freshScore = 0;
    let libyearVal = null;
    if (freshRes?.records) {
      const match = freshRes.records.find(r => r.package_name === pkgName);
      if (match && match.libyear !== null) {
        libyearVal = match.libyear;
        if (libyearVal >= 5.0) freshScore = 100;
        else if (libyearVal >= 3.0) freshScore = 75;
        else if (libyearVal >= 1.0) freshScore = 50;
        else if (libyearVal >= 0.25) freshScore = 25;
      }
    }

    const blastRadiusRatio = (node?.in_degree || 0) / Math.max(1, totalNodes - 1);
    const impactScore = Math.min(100, Math.round(blastRadiusRatio * 100));

    const rootBonus = node?.is_root ? 10 : (node?.depth === 1 ? 30 : 0);
    const inDegreePoints = Math.min(40, ((node?.in_degree || 0) / Math.max(1, totalNodes - 1)) * 40);
    const outDegreePoints = Math.min(30, ((node?.out_degree || 0) / Math.max(1, totalNodes - 1)) * 30);
    const critScore = Math.min(100, Math.round(rootBonus + inDegreePoints + outDegreePoints));

    const total = 0.35 * vulnScore + 0.25 * freshScore + 0.20 * impactScore + 0.20 * critScore;
    const finalScore = Math.round(total * 10) / 10;

    let cat = 'low';
    if (finalScore >= 75) cat = 'critical';
    else if (finalScore >= 50) cat = 'high';
    else if (finalScore >= 25) cat = 'moderate';

    return {
      package_name: pkgName,
      risk_score: finalScore,
      risk_category: cat,
      summary_explanation: `Package risk score is ${formatRiskScore(finalScore)}/10 (${cat.toUpperCase()}). Evaluates OSV vulnerability, LibYear freshness, downstream impact, and graph criticality.`,
      vulnerabilities_count: vulnCount,
      max_vuln_severity: vulnSev,
      libyear_lag: libyearVal,
      downstream_dependents_count: node?.in_degree || 0,
      factors: {
        vulnerability: { display_name: "Known Vulnerability Severity", normalized_score: vulnScore, weight: 0.35, weighted_score: Math.round(vulnScore * 0.35 * 10) / 10, explanation: `Peak severity '${vulnSev}' (${vulnCount} advisories).` },
        freshness: { display_name: "Dependency Freshness (LibYear)", normalized_score: freshScore, weight: 0.25, weighted_score: Math.round(freshScore * 0.25 * 10) / 10, explanation: libyearVal !== null ? `${libyearVal.toFixed(1)} LibYears lag.` : "Freshness data unavailable." },
        downstream_impact: { display_name: "Downstream Blast Radius", normalized_score: impactScore, weight: 0.20, weighted_score: Math.round(impactScore * 0.20 * 10) / 10, explanation: `${impactScore}% of repository packages affected downstream.` },
        criticality: { display_name: "Structural Dependency Criticality", normalized_score: critScore, weight: 0.20, weighted_score: Math.round(critScore * 0.20 * 10) / 10, explanation: `Graph topological score ${formatRiskScore(critScore)}/10.` }
      }
    };
  };

  const handleToggleHighlight = () => {
    if (!impactData || !selectedNode) return;
    if (isHighlighted) {
      setHighlightedImpact(null);
      setIsHighlighted(false);
    } else {
      setHighlightedImpact({
        target: selectedNode,
        affected: impactData.all_downstream_affected || [],
        paths: impactData.dependency_paths || {}
      });
      setIsHighlighted(true);
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat?.toLowerCase()) {
      case 'critical': return { bg: 'bg-[#F05252]/10', text: 'text-[#F05252]', border: 'border-[#F05252]/30', bar: 'bg-[#F05252]' };
      case 'high': return { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30', bar: 'bg-[#F59E0B]' };
      case 'moderate': return { bg: 'bg-[#4C8DCE]/10', text: 'text-[#4C8DCE]', border: 'border-[#4C8DCE]/30', bar: 'bg-[#4C8DCE]' };
      default: return { bg: 'bg-[#22C55E]/10', text: 'text-[#22C55E]', border: 'border-[#22C55E]/30', bar: 'bg-[#22C55E]' };
    }
  };

  if (!nodeObj) {
    return (
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-6 text-center text-slate-500 dark:text-[#94A3B8] space-y-3 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3 bg-slate-100 dark:bg-[#111C2E] text-slate-500 dark:text-[#94A3B8] rounded-xl w-fit mx-auto border border-slate-200 dark:border-[#26364D]">
          <Layers className="w-6 h-6 text-[#19B6A4]" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9]">No Package Selected</div>
          <p className="text-sm text-slate-500 dark:text-[#64748B] max-w-xs mx-auto leading-relaxed">
            Click on any package node in the graph to view direct & transitive dependents, reverse blast radius, and 4-factor risk score.
          </p>
        </div>
      </div>
    );
  }

  const catColor = getCategoryColor(packageRisk?.risk_category);

  return (
    <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-5 space-y-4 shadow-2xs dark:shadow-card transition-colors duration-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200/80 dark:border-[#26364D] pb-3">
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] font-bold">
            Inspected Package
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-[#F1F5F9] font-mono truncate max-w-[180px] sm:max-w-[240px]">
            {nodeObj.name}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {packageRisk && (
            <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
              Risk: {formatRiskScore(packageRisk.risk_score)} / 10
            </span>
          )}
          <span className="text-xs font-mono bg-[#19B6A4]/10 text-[#19B6A4] border border-[#19B6A4]/30 px-2 py-1 rounded-full font-semibold">
            {nodeObj.version ? `v${nodeObj.version}` : 'vUnknown'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-[#111C2E] p-1 rounded-xl border border-slate-200 dark:border-[#26364D]">
        <button
          onClick={() => setActiveTab('impact')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'impact'
              ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
              : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
          }`}
        >
          Impact Explorer
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'risk'
              ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
              : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
          }`}
        >
          Risk Score
        </button>
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'properties'
              ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
              : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
          }`}
        >
          Topology
        </button>
      </div>

      {/* TAB 1: DEPENDENCY IMPACT EXPLORER */}
      {activeTab === 'impact' && (
        <div className="space-y-3.5">
          {/* Highlight on Graph Button */}
          {impactData && (
            <motion.button
              onClick={handleToggleHighlight}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center justify-center space-x-2 text-xs font-bold py-2 px-3 rounded-xl transition duration-150 border ${
                isHighlighted
                  ? 'bg-[#F05252] text-white border-[#F05252] shadow-glow-rose'
                  : 'bg-slate-100 dark:bg-[#111C2E] hover:bg-slate-200 dark:hover:bg-[#1c2c44] text-[#F05252] border-[#F05252]/40'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{isHighlighted ? 'Clear Highlight on Graph' : 'Highlight Blast Radius & Paths on Graph'}</span>
            </motion.button>
          )}

          {/* Metric Summary Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Direct Dependents</span>
              <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
                {impactData ? impactData.direct_dependents_count : (nodeObj.in_degree || 0)} packages
              </span>
              <span className="text-[11px] text-slate-400 dark:text-[#64748B]">Immediate incoming links</span>
            </div>
            <div className="bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Transitive Dependents</span>
              <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
                {impactData ? impactData.transitive_dependents_count : '...'} packages
              </span>
              <span className="text-[11px] text-slate-400 dark:text-[#64748B]">Cascading hop &ge; 2</span>
            </div>
            <div className="bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Direct Dependencies</span>
              <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
                {impactData ? impactData.direct_dependencies_count : (nodeObj.out_degree || 0)} packages
              </span>
              <span className="text-[11px] text-slate-400 dark:text-[#64748B]">Outgoing dependencies</span>
            </div>
            <div className="bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <span className="text-[#F05252] block font-bold uppercase tracking-wider">Total Blast Radius</span>
              <span className="font-semibold text-[#F05252] font-mono text-sm mt-0.5 block">
                {impactData ? impactData.total_affected_count : '...'} affected
              </span>
              <span className="text-[11px] text-slate-400 dark:text-[#64748B]">All reverse reachability</span>
            </div>
          </div>

          {/* Exact Dependency Paths Section */}
          {impactData && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-bold border-b border-slate-200/80 dark:border-[#26364D] pb-1.5">
                <span className="text-slate-700 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                  <GitFork className="w-3.5 h-3.5 text-[#19B6A4]" />
                  <span>Downstream Paths to "{nodeObj.name}"</span>
                </span>
                <span className="font-mono text-slate-500 dark:text-[#64748B]">
                  {Object.keys(impactData.dependency_paths || {}).length} paths
                </span>
              </div>

              {Object.keys(impactData.dependency_paths || {}).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] italic py-1">
                  Zero downstream dependents depend on this package. It is a root consumer or leaf.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(impactData.dependency_paths || {}).map(([affPkg, paths]) => (
                    <div key={affPkg} className="text-xs bg-slate-50 dark:bg-[#111C2E] p-2 rounded-lg border border-slate-200 dark:border-[#26364D] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-900 dark:text-[#F1F5F9] font-bold">{affPkg}</span>
                        <span className="text-[11px] text-slate-400 dark:text-[#64748B]">
                          Depth: {paths[0] ? paths[0].length - 1 : 1}
                        </span>
                      </div>
                      {paths && paths[0] && (
                        <div className="text-[11px] font-mono text-[#19B6A4] bg-white dark:bg-[#172438] px-2 py-1 rounded border border-slate-200 dark:border-[#26364D] truncate">
                          {paths[0].join(' → ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DEPENDENCY RISK SCORE */}
      {activeTab === 'risk' && (
        <div className="space-y-3.5">
          {packageRisk ? (
            <>
              {/* Composite Score Card */}
              <div className={`p-3.5 rounded-xl border ${catColor.bg} ${catColor.border} space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-600 dark:text-[#94A3B8] flex items-center space-x-1.5">
                    <Flame className={`w-4 h-4 ${catColor.text}`} />
                    <span>Composite Risk Score</span>
                  </span>
                  <span className={`text-xs uppercase font-bold font-mono px-2 py-0.5 rounded ${catColor.bg} ${catColor.text} border ${catColor.border}`}>
                    {packageRisk.risk_category}
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className={`text-3xl font-extrabold font-mono ${catColor.text}`}>
                    {formatRiskScore(packageRisk.risk_score)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#64748B]">/ 10</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                  {packageRisk.summary_explanation}
                </p>
              </div>

              {/* 4 Factor Breakdown */}
              <div className="space-y-2.5 pt-1">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B] block">
                  4-Factor Breakdown
                </span>

                {packageRisk.factors && Object.entries(packageRisk.factors).map(([key, f]) => (
                  <div key={key} className="bg-slate-50 dark:bg-[#111C2E] p-2.5 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-800 dark:text-[#F1F5F9]">{f.display_name}</span>
                      <span className="font-mono text-slate-500 dark:text-[#94A3B8]">
                        {formatRiskScore(f.normalized_score)}/10 (wt: {(f.weight * 100).toFixed(0)}%)
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-[#172438] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          f.normalized_score >= 75 ? 'bg-[#F05252]' : f.normalized_score >= 50 ? 'bg-[#F59E0B]' : f.normalized_score >= 25 ? 'bg-[#4C8DCE]' : 'bg-[#22C55E]'
                        }`}
                        style={{ width: `${Math.min(100, f.normalized_score)}%` }}
                      ></div>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#64748B] leading-tight">
                      {f.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-xs text-slate-500 dark:text-[#94A3B8]">
              Calculating 4-factor risk score...
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOPOLOGY PROPERTIES */}
      {activeTab === 'properties' && (
        <div className="space-y-2.5 text-xs">
          <div className="bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
            <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Classification</span>
            <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] capitalize text-sm mt-0.5 block">{nodeObj.dep_type}</span>
          </div>
          <div className="bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
            <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Root Hop Distance</span>
            <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
              {nodeObj.depth !== null ? `${nodeObj.depth} hops` : 'Unreachable'}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
            <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">In-Degree (Incoming Dependents)</span>
            <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
              {nodeObj.in_degree} package(s)
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
            <span className="text-slate-500 dark:text-[#64748B] block font-bold uppercase tracking-wider">Out-Degree (Outgoing Dependencies)</span>
            <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-sm mt-0.5 block">
              {nodeObj.out_degree} package(s)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
