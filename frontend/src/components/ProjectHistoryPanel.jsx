import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  History,
  FolderPlus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  ChevronRight,
  Layers,
  Play,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  Cpu
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  getDatabaseStatus,
  listProjects,
  createProject,
  getProjectAnalyses,
  getAnalysisDetail
} from '../services/api';
import { easeSoft } from '../utils/animations';

export default function ProjectHistoryPanel({
  onLoadSnapshot,
  currentProjectName
}) {
  const shouldReduceMotion = useReducedMotion();
  const [dbStatus, setDbStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSnapshotId, setLoadingSnapshotId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [projectsError, setProjectsError] = useState(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const fetchProjects = async () => {
    setProjectsError(null);
    try {
      const projList = await listProjects();
      setProjects(projList);
      if (projList.length > 0 && !selectedProjectId) {
        const match = currentProjectName
          ? projList.find(p => p.name === currentProjectName)
          : null;
        setSelectedProjectId(match ? match.id : projList[0].id);
      }
    } catch (err) {
      console.error('Failed to list projects:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Could not load project history';
      setProjectsError(detail);
    }
  };

  const fetchStatusAndProjects = async () => {
    setLoading(true);
    setErrorMsg(null);
    setProjectsError(null);
    let statusRes = null;
    try {
      statusRes = await getDatabaseStatus();
      setDbStatus(statusRes);
    } catch (err) {
      console.warn('Database offline or unreachable:', err);
      setDbStatus({
        connected: false,
        status: 'unreachable',
        message: 'PostgreSQL database is currently disconnected or unavailable.'
      });
      setLoading(false);
      return;
    }

    if (statusRes && statusRes.connected) {
      await fetchProjects();
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatusAndProjects();
  }, []);

  const prevProjectNameRef = useRef(currentProjectName);

  useEffect(() => {
    if (currentProjectName && currentProjectName !== prevProjectNameRef.current && projects.length > 0) {
      prevProjectNameRef.current = currentProjectName;
      const match = projects.find(p => p.name === currentProjectName);
      if (match) {
        setSelectedProjectId(match.id);
      }
    }
  }, [currentProjectName, projects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setAnalyses([]);
      return;
    }
    const loadAnalyses = async () => {
      try {
        const list = await getProjectAnalyses(selectedProjectId);
        setAnalyses(list);
      } catch (err) {
        console.error('Failed to load project analyses', err);
      }
    };
    loadAnalyses();
  }, [selectedProjectId]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreatingProject(true);
    setErrorMsg(null);
    try {
      const created = await createProject(newProjectName.trim());
      setNewProjectName('');
      await fetchStatusAndProjects();
      setSelectedProjectId(created.id);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to create project';
      setErrorMsg(detail);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleLoadSnapshot = async (analysisId) => {
    setLoadingSnapshotId(analysisId);
    setErrorMsg(null);
    try {
      const detail = await getAnalysisDetail(analysisId);
      if (detail && detail.graph_snapshot) {
        await onLoadSnapshot(detail);
      } else {
        setErrorMsg('Selected analysis run does not contain an accessible graph snapshot.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load analysis snapshot';
      setErrorMsg(msg);
    } finally {
      setLoadingSnapshotId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-[#26364D] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-[#4C8DCE]/10 text-[#4C8DCE] rounded-xl border border-[#4C8DCE]/20 shadow-sm">
            <Database className="w-5 h-5 text-[#4C8DCE]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
              Project History
            </h2>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8]">
              Browse and restore saved analysis snapshots
            </p>
          </div>
        </div>

        {/* Database Connection Badge */}
        <div className="flex items-center space-x-2.5">
          {dbStatus?.connected ? (
            <div className="flex items-center space-x-2 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/25 px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
              </span>
              <span>PostgreSQL Active ({dbStatus.total_projects} projects)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/25 px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-medium">
              <Cpu className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Database Standby / In-Memory Mode</span>
            </div>
          )}
          <motion.button
            type="button"
            onClick={fetchStatusAndProjects}
            disabled={loading}
            whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            className="p-2 text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9] bg-slate-100 hover:bg-slate-200 dark:bg-[#111C2E] dark:hover:bg-[#1c2c44] rounded-xl border border-slate-200 dark:border-[#26364D] transition"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            className="text-sm bg-rose-50 dark:bg-[#F05252]/10 border border-rose-200 dark:border-[#F05252]/25 text-rose-700 dark:text-[#F05252] p-3.5 rounded-xl flex items-start space-x-2.5 overflow-hidden"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-[#F05252] mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Database Offline Notice */}
      {!dbStatus?.connected && (
        <div className="bg-slate-50 dark:bg-[#111C2E] border border-amber-200 dark:border-[#F59E0B]/30 p-5 rounded-2xl text-sm space-y-2 text-slate-700 dark:text-[#94A3B8]">
          <div className="font-bold text-[#F59E0B] flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
            <span>PostgreSQL Persistence Notice</span>
          </div>
          <p className="text-slate-600 dark:text-[#94A3B8] leading-relaxed">
            {dbStatus?.message || "Running in pure in-memory mode. The live graph analyzer, simulation engine, OSV security, and LibYear calculations function fully without a database."}
          </p>
          <p className="text-xs text-slate-500 dark:text-[#64748B]">
            To enable persistence, start PostgreSQL and configure <code className="text-[#19B6A4] font-mono">DATABASE_URL</code> in your backend environment.
          </p>
        </div>
      )}

      {/* Main Database Content (when connected) */}
      {dbStatus?.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-sm">

          {/* Col 1: Projects & Registration */}
          <div className="space-y-4 bg-slate-50 dark:bg-[#111C2E] p-4.5 rounded-2xl border border-slate-200/80 dark:border-[#26364D] h-fit">
            <div className="font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-2 border-b border-slate-200 dark:border-[#26364D] pb-2.5 text-sm sm:text-base">
              <FolderPlus className="w-4 h-4 text-[#19B6A4]" />
              <span>Project Workspace Registry</span>
            </div>

            {/* Projects Fetch Error with Retry */}
            {projectsError && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 rounded-xl text-xs space-y-2 text-amber-800 dark:text-amber-300">
                <div className="font-semibold flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Could not load project history</span>
                </div>
                <p className="font-mono text-[11px] break-words text-slate-600 dark:text-[#94A3B8]">{projectsError}</p>
                <button
                  type="button"
                  onClick={fetchProjects}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 rounded-lg text-amber-900 dark:text-amber-200 font-medium transition flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Project Select Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">Select Registered Project</label>
              {projects.length > 0 ? (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-white dark:bg-[#172438] border border-slate-300 dark:border-[#26364D] rounded-xl px-3 py-2 text-slate-900 dark:text-[#F1F5F9] focus:outline-none focus:border-[#19B6A4]/60 font-mono text-sm cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.analysis_count} snapshots)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-slate-500 dark:text-[#64748B] italic py-1">No projects registered yet.</div>
              )}
            </div>

            {/* Quick Register Form */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#26364D]/60">
              <label className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">Register New Project</label>
              <form onSubmit={handleCreateProject} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. auth-service"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 bg-white dark:bg-[#172438] border border-slate-300 dark:border-[#26364D] rounded-xl px-3 py-1.5 text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4]/60 text-sm font-mono"
                />
                <motion.button
                  type="submit"
                  disabled={isCreatingProject || !newProjectName.trim()}
                  whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.96 }}
                  className="bg-[#4C8DCE] hover:bg-[#3b7bb8] disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl transition font-semibold text-sm shadow-2xs"
                >
                  {isCreatingProject ? 'Adding...' : 'Add'}
                </motion.button>
              </form>
            </div>
          </div>

          {/* Col 2 & 3: Historical Analysis Runs */}
          <div className="lg:col-span-2 space-y-3 bg-slate-50 dark:bg-[#111C2E] p-3.5 sm:p-4.5 rounded-2xl border border-slate-200/80 dark:border-[#26364D]">
            <div className="flex items-center justify-between font-bold text-slate-800 dark:text-[#F1F5F9] border-b border-slate-200 dark:border-[#26364D] pb-2.5">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-[#4C8DCE]" />
                <span className="text-sm sm:text-base">Analysis Snapshot History ({analyses.length})</span>
              </div>
              <span className="text-xs uppercase font-mono tracking-wider text-slate-500 dark:text-[#64748B]">
                Immutable Snapshots
              </span>
            </div>

            {analyses.length > 0 ? (
              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                {analyses.map((run) => {
                  const isCurrentLoading = loadingSnapshotId === run.id;
                  return (
                    <motion.div
                      key={run.id}
                      data-analysis-id={run.id}
                      whileHover={shouldReduceMotion ? {} : { y: -1.5, transition: { duration: 0.15, ease: easeSoft } }}
                      className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#172438] hover:bg-slate-50/80 dark:hover:bg-[#1c2c44] border border-slate-200/90 dark:border-[#26364D] hover:border-[#19B6A4]/40 p-3.5 rounded-2xl transition-colors duration-150 text-slate-700 dark:text-[#94A3B8] shadow-2xs dark:shadow-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-slate-100 dark:bg-[#111C2E] rounded-xl text-slate-500 dark:text-[#94A3B8]">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">
                              {new Date(run.created_at).toLocaleString()}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-[#94A3B8] bg-slate-100 dark:bg-[#111C2E] px-1.5 py-0.2 rounded border border-slate-200 dark:border-[#26364D]" title={run.id}>
                              {run.id.slice(0, 8)}
                            </span>
                          </div>
                          <div className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] flex items-center space-x-2 mt-0.5">
                            <span className="font-mono text-[#19B6A4] font-medium">{run.total_packages} packages</span>
                            <span>&bull;</span>
                            <span className="font-mono text-slate-600 dark:text-[#94A3B8]">{run.total_dependency_edges} edges</span>
                            <span>&bull;</span>
                            <span className={run.has_cycles ? 'text-[#F05252] font-medium' : 'text-[#22C55E] font-medium'}>
                              {run.has_cycles ? `Cyclic (${run.cycle_count})` : 'Valid DAG'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <motion.button
                        type="button"
                        onClick={() => handleLoadSnapshot(run.id)}
                        disabled={isCurrentLoading}
                        whileHover={isCurrentLoading ? {} : { scale: 1.02 }}
                        whileTap={isCurrentLoading ? {} : { scale: 0.97 }}
                        className="w-full sm:w-auto justify-center flex items-center space-x-1.5 text-sm font-bold bg-[#19B6A4] hover:bg-[#159e8e] disabled:opacity-50 text-[#0B1220] px-4 py-2 rounded-xl transition shadow-glow-teal duration-150"
                      >
                        <Play className={`w-3.5 h-3.5 ${isCurrentLoading ? 'animate-spin' : ''}`} />
                        <span>{isCurrentLoading ? 'Restoring Snapshot...' : 'Restore Snapshot'}</span>
                      </motion.button>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 dark:text-[#64748B] italic py-8 text-center text-sm">
                No previous analysis snapshots found for this project. Submit a manifest in Analyze Dependencies to record the first snapshot.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
