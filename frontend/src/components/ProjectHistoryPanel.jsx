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
  Play
} from 'lucide-react';
import { 
  getDatabaseStatus, 
  listProjects, 
  createProject, 
  getProjectAnalyses, 
  getAnalysisDetail 
} from '../services/api';

export default function ProjectHistoryPanel({ 
  onLoadSnapshot, 
  currentProjectName 
}) {
  const [dbStatus, setDbStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
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

  // Synchronize selected project when currentProjectName prop actually changes
  useEffect(() => {
    if (currentProjectName && currentProjectName !== prevProjectNameRef.current && projects.length > 0) {
      prevProjectNameRef.current = currentProjectName;
      const match = projects.find(p => p.name === currentProjectName);
      if (match) {
        setSelectedProjectId(match.id);
      }
    }
  }, [currentProjectName, projects]);

  // Fetch analyses whenever selectedProjectId changes
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
    setLoadingSnapshot(true);
    setErrorMsg(null);
    try {
      const detail = await getAnalysisDetail(analysisId);
      if (detail && detail.graph_snapshot) {
        await onLoadSnapshot(detail);
      } else {
        setErrorMsg('Selected analysis run does not contain a graph snapshot.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load analysis snapshot';
      setErrorMsg(msg);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              PostgreSQL Persistence & Historical Analysis Runs
            </h2>
            <p className="text-xs text-slate-400">
              Project registry, immutable graph snapshots, and audit trail
            </p>
          </div>
        </div>

        {/* Database Connection Badge */}
        <div className="flex items-center space-x-2">
          {dbStatus?.connected ? (
            <div className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>PostgreSQL Active ({dbStatus.total_projects} projects)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 px-3 py-1.5 rounded-full text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Database Standby / In-Memory Mode</span>
            </div>
          )}
          <button
            type="button"
            onClick={fetchStatusAndProjects}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Database Offline Notice */}
      {!dbStatus?.connected && (
        <div className="bg-slate-900/60 border border-slate-700/60 p-4 rounded-lg text-xs space-y-2 text-slate-300">
          <div className="font-semibold text-amber-300 flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>PostgreSQL Persistence Notice</span>
          </div>
          <p className="text-slate-400">
            {dbStatus?.message || "Running in pure in-memory mode. The live graph analyzer, simulation engine, OSV security, and LibYear calculations function fully without a database."}
          </p>
          <p className="text-[11px] text-slate-500">
            To enable persistence, start PostgreSQL and configure <code className="text-teal-400">DATABASE_URL</code> in your backend <code className="text-teal-400">.env</code> file.
          </p>
        </div>
      )}

      {/* Main Database Content (when connected) */}
      {dbStatus?.connected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Col 1: Projects & Registration */}
          <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-slate-700/60">
            <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <FolderPlus className="w-4 h-4 text-teal-400" />
              <span>Select or Register Project</span>
            </div>

            {/* Project Select Dropdown */}
            {projects.length > 0 ? (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.analysis_count} scans)
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-slate-500 italic">No projects registered yet.</div>
            )}

            {/* Quick Register Form */}
            <form onSubmit={handleCreateProject} className="flex gap-1.5 pt-1">
              <input
                type="text"
                placeholder="New project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={isCreatingProject || !newProjectName.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white px-3 py-1 rounded-lg transition font-medium"
              >
                Add
              </button>
            </form>
          </div>

          {/* Col 2 & 3: Historical Analysis Runs */}
          <div className="md:col-span-2 space-y-2 bg-slate-900/40 p-3 rounded-lg border border-slate-700/60">
            <div className="flex items-center justify-between font-semibold text-slate-200">
              <div className="flex items-center space-x-1.5">
                <History className="w-4 h-4 text-indigo-400" />
                <span>Analysis Run History ({analyses.length})</span>
              </div>
              <span className="text-[11px] text-slate-500">Immutable Snapshots</span>
            </div>

            {analyses.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {analyses.map((run) => (
                  <div
                    key={run.id}
                    data-analysis-id={run.id}
                    className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 hover:border-indigo-500/50 p-2 rounded-lg transition text-slate-300"
                  >
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[11px] text-slate-200">
                            {new Date(run.created_at).toLocaleString()}
                          </span>
                          <span className="font-mono text-[9px] text-slate-500 bg-slate-900/60 px-1 py-0.2 rounded border border-slate-700/60" title={run.id}>
                            {run.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                          <span>{run.total_packages} packages</span>
                          <span>&bull;</span>
                          <span>{run.total_dependency_edges} edges</span>
                          <span>&bull;</span>
                          <span className={run.has_cycles ? 'text-rose-400' : 'text-emerald-400'}>
                            {run.has_cycles ? `Cyclic (${run.cycle_count})` : 'DAG'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLoadSnapshot(run.id)}
                      disabled={loadingSnapshot}
                      className="flex items-center space-x-1 text-[11px] bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded transition"
                    >
                      <Play className="w-3 h-3 text-indigo-400" />
                      <span>Load Snapshot</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-500 italic py-4 text-center">
                No previous analysis snapshots found for this project. Submit a manifest to generate the first run.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
