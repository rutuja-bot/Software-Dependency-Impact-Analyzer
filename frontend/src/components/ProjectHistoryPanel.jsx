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
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const fetchStatusAndProjects = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const statusRes = await getDatabaseStatus();
      setDbStatus(statusRes);
      if (statusRes.connected) {
        const projList = await listProjects();
        setProjects(projList);
        if (projList.length > 0 && !selectedProjectId) {
          const match = currentProjectName
            ? projList.find(p => p.name === currentProjectName)
            : null;
          setSelectedProjectId(match ? match.id : projList[0].id);
        }
      }
    } catch (err) {
      console.warn('Database offline or unreachable:', err);
      setDbStatus({
        connected: false,
        status: 'unreachable',
        message: 'PostgreSQL database is currently disconnected or unavailable.'
      });
    } finally {
      setLoading(false);
    }
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
    <div className="bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xs dark:shadow-card space-y-5 transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/[0.06] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-500/20 shadow-sm">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Project History
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Browse and restore saved analysis snapshots
            </p>
          </div>
        </div>

        {/* Database Connection Badge */}
        <div className="flex items-center space-x-2.5">
          {dbStatus?.connected ? (
            <div className="flex items-center space-x-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>PostgreSQL Active ({dbStatus.total_projects} projects)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25 px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-medium">
              <Cpu className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Database Standby / In-Memory Mode</span>
            </div>
          )}
          <motion.button
            type="button"
            onClick={fetchStatusAndProjects}
            disabled={loading}
            whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
            whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#070b14] dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/[0.06] transition"
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
            className="text-sm bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 p-3.5 rounded-xl flex items-start space-x-2.5 overflow-hidden"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Database Offline Notice */}
      {!dbStatus?.connected && (
        <div className="bg-slate-50 dark:bg-[#070b14] border border-amber-200 dark:border-amber-500/30 p-5 rounded-2xl text-sm space-y-2 text-slate-700 dark:text-slate-300">
          <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>PostgreSQL Persistence Notice</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {dbStatus?.message || "Running in pure in-memory mode. The live graph analyzer, simulation engine, OSV security, and LibYear calculations function fully without a database."}
          </p>
          <p className="text-xs text-slate-500">
            To enable persistence, start PostgreSQL and configure <code className="text-cyan-700 dark:text-cyan-400 font-mono">DATABASE_URL</code> in your backend environment.
          </p>
        </div>
      )}

      {/* Main Database Content (when connected) */}
      {dbStatus?.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-sm">

          {/* Col 1: Projects & Registration */}
          <div className="space-y-4 bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] h-fit">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-2 border-b border-slate-200 dark:border-white/[0.06] pb-2.5 text-sm sm:text-base">
              <FolderPlus className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Project Workspace Registry</span>
            </div>

            {/* Project Select Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Select Registered Project</label>
              {projects.length > 0 ? (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-white dark:bg-[#0f1422] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-cyan-500/60 font-mono text-sm cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.analysis_count} snapshots)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-slate-500 italic py-1">No projects registered yet.</div>
              )}
            </div>

            {/* Quick Register Form */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/[0.04]">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Register New Project</label>
              <form onSubmit={handleCreateProject} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. auth-service"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 bg-white dark:bg-[#0f1422] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3 py-1.5 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 text-sm font-mono"
                />
                <motion.button
                  type="submit"
                  disabled={isCreatingProject || !newProjectName.trim()}
                  whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.96 }}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl transition font-semibold text-sm shadow-2xs"
                >
                  {isCreatingProject ? 'Adding...' : 'Add'}
                </motion.button>
              </form>
            </div>
          </div>

          {/* Col 2 & 3: Historical Analysis Runs */}
          <div className="lg:col-span-2 space-y-3 bg-slate-50 dark:bg-[#070b14] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/[0.06] pb-2.5">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm sm:text-base">Analysis Snapshot History ({analyses.length})</span>
              </div>
              <span className="text-xs uppercase font-mono tracking-wider text-slate-500">
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
                      className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0f1422] hover:bg-slate-50/80 dark:hover:bg-[#141b2e] border border-slate-200/90 dark:border-white/[0.06] hover:border-indigo-400 dark:hover:border-indigo-500/40 p-3.5 rounded-2xl transition-colors duration-150 text-slate-700 dark:text-slate-300 shadow-2xs dark:shadow-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-slate-500 dark:text-slate-400">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              {new Date(run.created_at).toLocaleString()}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#070b14] px-1.5 py-0.2 rounded border border-slate-200 dark:border-white/[0.06]" title={run.id}>
                              {run.id.slice(0, 8)}
                            </span>
                          </div>
                          <div className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 flex items-center space-x-2 mt-0.5">
                            <span className="font-mono text-cyan-700 dark:text-cyan-400 font-medium">{run.total_packages} packages</span>
                            <span>&bull;</span>
                            <span className="font-mono text-slate-600 dark:text-slate-300">{run.total_dependency_edges} edges</span>
                            <span>&bull;</span>
                            <span className={run.has_cycles ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
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
                        className="flex items-center space-x-1.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition shadow-2xs duration-150"
                      >
                        <Play className={`w-3.5 h-3.5 ${isCurrentLoading ? 'animate-spin' : ''}`} />
                        <span>{isCurrentLoading ? 'Restoring Snapshot...' : 'Restore Snapshot'}</span>
                      </motion.button>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 italic py-8 text-center text-sm">
                No previous analysis snapshots found for this project. Submit a manifest in Analyze Dependencies to record the first snapshot.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
