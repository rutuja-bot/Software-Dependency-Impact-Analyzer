import React, { useState, useEffect } from 'react';
import {
  Activity,
  Target,
  ShieldAlert,
  Clock,
  Layers,
  ArrowRight,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Sparkles,
  GitFork,
  ArrowDownRight,
  Filter,
  Flame,
  Eye,
  Workflow
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { exploreImpact, getProjectRisk } from '../services/api';
import { formatRiskScore } from '../utils/risk';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function InspectorPage() {
  const shouldReduceMotion = useReducedMotion();
  const {
    displayNodes,
    selectedNode,
    setSelectedNode,
    analysisResult,
    securityResult,
    freshnessResult,
    isSimulatedActive,
    simulationResult,
    currentAnalysisId,
    setHighlightedImpact,
    highlightedImpact
  } = useAnalysis();

  const [impactData, setImpactData] = useState(null);
  const [isImpactLoading, setIsImpactLoading] = useState(false);
  const [packageRisk, setPackageRisk] = useState(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [activeTab, setActiveTab] = useState('impact'); // 'impact' | 'risk' | 'all'

  const nodeObj = displayNodes.find((n) => n.name === selectedNode);

  const isSimulatedNode = Boolean(
    isSimulatedActive && simulationResult?.diff?.added_nodes?.includes(selectedNode)
  );

  useEffect(() => {
    if (!selectedNode) {
      setImpactData(null);
      setPackageRisk(null);
      setIsHighlighted(false);
      return;
    }

    let isMounted = true;
    const fetchDetails = async () => {
      setIsImpactLoading(true);
      setIsRiskLoading(true);

      try {
        const impactRes = await exploreImpact(selectedNode, currentAnalysisId || analysisResult?.analysis_id);
        if (isMounted) setImpactData(impactRes);
      } catch (err) {
        console.warn("Could not load impact details:", err);
      } finally {
        if (isMounted) setIsImpactLoading(false);
      }

      try {
        const riskRes = await getProjectRisk(currentAnalysisId || analysisResult?.analysis_id);
        if (isMounted && riskRes && riskRes.all_package_risks) {
          const matched = riskRes.all_package_risks.find(p => p.package_name === selectedNode);
          if (matched) {
            setPackageRisk(matched);
          } else {
            setPackageRisk(buildFallbackRisk(selectedNode, nodeObj, displayNodes.length, securityResult, freshnessResult));
          }
        }
      } catch (err) {
        if (isMounted) {
          setPackageRisk(buildFallbackRisk(selectedNode, nodeObj, displayNodes.length, securityResult, freshnessResult));
        }
      } finally {
        if (isMounted) setIsRiskLoading(false);
      }
    };

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [selectedNode, currentAnalysisId, analysisResult]);

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

  if (!analysisResult) {
    return (
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-10 text-center text-slate-500 dark:text-[#94A3B8] space-y-4 max-w-xl mx-auto shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="p-3.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-2xl w-fit mx-auto border border-[#19B6A4]/20">
          <Activity className="w-8 h-8 text-[#19B6A4]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-[#F1F5F9]">No Analysis Available</h3>
          <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
            Please analyze a manifest or load a snapshot to inspect individual packages, reverse dependencies, and blast radius cascades.
          </p>
        </div>
      </div>
    );
  }

  const filteredPackageList = displayNodes.filter(n =>
    n.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const catColor = getCategoryColor(packageRisk?.risk_category);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-5 sm:p-6 shadow-2xs dark:shadow-card transition-colors duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/20 shadow-sm">
              <Activity className="w-6 h-6 text-[#19B6A4]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                  Dependency Impact & Risk Explorer
                </h2>
                {isSimulatedActive && (
                  <span className="text-xs font-mono bg-indigo-50 dark:bg-[#4C8DCE]/15 text-[#4C8DCE] border border-indigo-200 dark:border-[#4C8DCE]/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#4C8DCE]" />
                    <span>Simulation Mode</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-[#94A3B8] mt-1 leading-relaxed">
                Inspect direct & transitive dependents, downstream reachability paths, and explainable 0–10 risk scores
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Package Selector List */}
        <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs dark:shadow-card h-fit transition-colors duration-200">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#26364D] pb-2.5">
            <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9]">Package Registry ({displayNodes.length})</span>
            <span className="text-xs font-mono text-slate-500 dark:text-[#94A3B8]">Select to inspect</span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-[#94A3B8]" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search package name..."
              className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4]/60 transition duration-150"
            />
          </div>

          <div className="space-y-1.5 max-h-56 sm:max-h-72 lg:max-h-[560px] overflow-y-auto pr-1">
            {filteredPackageList.map((node) => {
              const isSelected = node.name === selectedNode;
              return (
                <button
                  key={node.name}
                  onClick={() => {
                    setSelectedNode(node.name);
                    setImpactData(null);
                    setPackageRisk(null);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-mono transition flex items-center justify-between group duration-150 ${
                    isSelected
                      ? 'bg-[#19B6A4] text-[#0B1220] font-bold shadow-glow-teal border border-[#19B6A4]'
                      : 'bg-slate-50 dark:bg-[#111C2E] hover:bg-slate-100 dark:hover:bg-[#1c2c44] text-slate-700 dark:text-[#94A3B8] border border-slate-200 dark:border-[#26364D]'
                  }`}
                >
                  <span className="truncate max-w-[170px]">{node.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-sans ${
                    isSelected ? 'bg-black/20 text-[#0B1220]' : 'bg-slate-200 dark:bg-[#172438] text-slate-600 dark:text-[#94A3B8]'
                  }`}>
                    {node.dep_type || 'pkg'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Package Details & Impact / Risk Tabs */}
        <div className="lg:col-span-2 space-y-6">
          {!nodeObj ? (
            <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-12 text-center text-slate-500 dark:text-[#94A3B8] space-y-3 shadow-2xs dark:shadow-card">
              <div className="p-3.5 bg-slate-100 dark:bg-[#111C2E] text-slate-500 dark:text-[#94A3B8] rounded-xl w-fit mx-auto border border-slate-200 dark:border-[#26364D]">
                <Layers className="w-8 h-8 text-[#19B6A4]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-800 dark:text-[#F1F5F9]">No Package Selected</h4>
                <p className="text-sm text-slate-500 dark:text-[#94A3B8] max-w-sm mx-auto leading-relaxed">
                  Select any package from the list on the left to inspect its direct/transitive dependents, exact downstream paths, and 4-factor risk score.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Package Header Card */}
              <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-6 space-y-4 shadow-2xs dark:shadow-card transition-colors duration-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#26364D] pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] font-bold">
                      Target Package
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#F1F5F9] font-mono mt-0.5">{nodeObj.name}</h3>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    {packageRisk && (
                      <span className={`text-sm font-mono font-bold px-3 py-1 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                        Risk Score: {formatRiskScore(packageRisk.risk_score)} / 10 ({packageRisk.risk_category?.toUpperCase()})
                      </span>
                    )}
                    <span className="text-sm font-mono bg-[#19B6A4]/10 text-[#19B6A4] border border-[#19B6A4]/25 px-3 py-1 rounded-full font-semibold">
                      {nodeObj.version ? `v${nodeObj.version}` : 'vUnknown'}
                    </span>
                  </div>
                </div>

                {/* Sub Navigation Tabs */}
                <div className="flex items-center space-x-2 bg-slate-100 dark:bg-[#111C2E] p-1.5 rounded-xl border border-slate-200 dark:border-[#26364D]">
                  <button
                    onClick={() => setActiveTab('impact')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${
                      activeTab === 'impact'
                        ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
                        : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    Downstream Impact Explorer
                  </button>
                  <button
                    onClick={() => setActiveTab('risk')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${
                      activeTab === 'risk'
                        ? 'bg-[#19B6A4] text-[#0B1220] shadow-sm font-bold'
                        : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    4-Factor Risk Score
                  </button>
                </div>
              </div>

              {/* TAB 1: IMPACT EXPLORER */}
              {activeTab === 'impact' && (
                <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-6 space-y-5 shadow-2xs dark:shadow-card">
                  {/* Highlight on Graph Action */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9]">
                      Blast Radius & Reverse Dependency Cascade
                    </span>
                    <motion.button
                      onClick={handleToggleHighlight}
                      disabled={!impactData}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex items-center space-x-2 text-xs font-bold py-2 px-4 rounded-xl transition duration-150 border ${
                        isHighlighted
                          ? 'bg-[#F05252] text-white border-[#F05252] shadow-glow-rose'
                          : 'bg-slate-100 dark:bg-[#111C2E] hover:bg-slate-200 dark:hover:bg-[#1c2c44] text-[#F05252] border-[#F05252]/40'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      <span>{isHighlighted ? 'Clear Highlight on Graph' : 'Highlight Blast Radius & Paths on Graph'}</span>
                    </motion.button>
                  </div>

                  {/* Impact Breakdown Cards (4 Cards) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
                      <span className="text-slate-500 dark:text-[#64748B] block text-xs uppercase font-bold tracking-wider">Direct Dependents</span>
                      <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-lg mt-0.5 block">
                        {impactData ? impactData.direct_dependents_count : (nodeObj.in_degree || 0)}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-[#64748B]">Incoming links</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
                      <span className="text-slate-500 dark:text-[#64748B] block text-xs uppercase font-bold tracking-wider">Transitive Dependents</span>
                      <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-lg mt-0.5 block">
                        {impactData ? impactData.transitive_dependents_count : '...'}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-[#64748B]">Cascade hop &ge; 2</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
                      <span className="text-slate-500 dark:text-[#64748B] block text-xs uppercase font-bold tracking-wider">Direct Dependencies</span>
                      <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] font-mono text-lg mt-0.5 block">
                        {impactData ? impactData.direct_dependencies_count : (nodeObj.out_degree || 0)}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-[#64748B]">Outgoing edges</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-[#111C2E] p-3.5 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
                      <span className="text-[#F05252] block text-xs uppercase font-bold tracking-wider">Total Blast Radius</span>
                      <span className="font-semibold text-[#F05252] font-mono text-lg mt-0.5 block">
                        {impactData ? impactData.total_affected_count : '...'} pkgs
                      </span>
                      <span className="text-xs text-slate-400 dark:text-[#64748B]">
                        {impactData ? `${((impactData.total_affected_count / Math.max(1, displayNodes.length)) * 100).toFixed(1)}% of graph` : '...'}
                      </span>
                    </div>
                  </div>

                  {/* Exact Dependency Paths Section */}
                  {impactData && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#26364D] pb-2">
                        <span className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2">
                          <GitFork className="w-4 h-4 text-[#19B6A4]" />
                          <span>Exact Paths Connecting Downstream Packages &rarr; "{nodeObj.name}"</span>
                        </span>
                        <span className="text-xs font-mono text-slate-500 dark:text-[#94A3B8]">
                          {Object.keys(impactData.dependency_paths || {}).length} computed path(s)
                        </span>
                      </div>

                      {Object.keys(impactData.dependency_paths || {}).length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-[#94A3B8] italic py-2">
                          Zero downstream dependents depend on this package. It is a root consumer or leaf.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {Object.entries(impactData.dependency_paths || {}).map(([affPkg, paths]) => (
                            <div key={affPkg} className="bg-slate-50 dark:bg-[#111C2E] p-3 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-slate-900 dark:text-[#F1F5F9] font-bold text-sm">{affPkg}</span>
                                <span className="text-xs text-slate-500 dark:text-[#64748B] font-mono">
                                  Hop Depth: {paths[0] ? paths[0].length - 1 : 1}
                                </span>
                              </div>
                              {paths && paths[0] && (
                                <div className="text-xs font-mono text-[#19B6A4] bg-white dark:bg-[#172438] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#26364D] truncate flex items-center space-x-1">
                                  <span className="text-slate-400 dark:text-[#64748B]">Path:</span>
                                  <span className="font-semibold">{paths[0].join(' → ')}</span>
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

              {/* TAB 2: 4-FACTOR RISK SCORE */}
              {activeTab === 'risk' && (
                <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-6 space-y-5 shadow-2xs dark:shadow-card">
                  {packageRisk ? (
                    <>
                      {/* Composite Risk Overview */}
                      <div className={`p-5 rounded-2xl border ${catColor.bg} ${catColor.border} space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase font-bold tracking-wider text-slate-600 dark:text-[#94A3B8] flex items-center space-x-2">
                            <Flame className={`w-5 h-5 ${catColor.text}`} />
                            <span>Composite Package Risk Score (0–10)</span>
                          </span>
                          <span className={`text-sm uppercase font-bold font-mono px-3 py-1 rounded-full ${catColor.bg} ${catColor.text} border ${catColor.border}`}>
                            Category: {packageRisk.risk_category}
                          </span>
                        </div>
                        <div className="flex items-baseline space-x-3">
                          <span className={`text-4xl font-extrabold font-mono ${catColor.text}`}>
                            {formatRiskScore(packageRisk.risk_score)}
                          </span>
                          <span className="text-sm text-slate-500 dark:text-[#64748B]">/ 10 points</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-[#94A3B8] leading-relaxed">
                          {packageRisk.summary_explanation}
                        </p>
                      </div>

                      {/* Factor Breakdown */}
                      <div className="space-y-3 pt-2">
                        <span className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-[#64748B] block">
                          Four Weighted Risk Factor Contributions
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {packageRisk.factors && Object.entries(packageRisk.factors).map(([key, f]) => (
                            <div key={key} className="bg-slate-50 dark:bg-[#111C2E] p-4 rounded-xl border border-slate-200 dark:border-[#26364D] space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="text-slate-800 dark:text-[#F1F5F9] font-bold">{f.display_name}</span>
                                <span className="font-mono text-slate-500 dark:text-[#94A3B8]">
                                  {formatRiskScore(f.normalized_score)}/10 &bull; {(f.weight * 100).toFixed(0)}% wt
                                </span>
                              </div>
                              {/* Progress bar */}
                              <div className="w-full bg-slate-200 dark:bg-[#172438] h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    f.normalized_score >= 75 ? 'bg-[#F05252]' : f.normalized_score >= 50 ? 'bg-[#F59E0B]' : f.normalized_score >= 25 ? 'bg-[#4C8DCE]' : 'bg-[#22C55E]'
                                  }`}
                                  style={{ width: `${Math.min(100, f.normalized_score)}%` }}
                                ></div>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-[#94A3B8] leading-relaxed">
                                {f.explanation}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10 text-sm text-slate-500 dark:text-[#94A3B8]">
                      Calculating explainable 4-factor risk score...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
