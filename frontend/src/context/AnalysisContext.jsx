import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  checkHealth, 
  getAppInfo, 
  analyzeProject, 
  getDatabaseStatus,
  getAnalysisDetail,
  getAnalysisSecurity,
  getAnalysisFreshness,
  restoreAnalysisSnapshot
} from '../services/api';

const AnalysisContext = createContext(null);

const STORAGE_AUTH_KEY = 'dep_analyzer_user';

export function AnalysisProvider({ children }) {
  // Authentication State (Client-Side Session)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_AUTH_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Health and System Metadata
  const [backendHealth, setBackendHealth] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);

  // Core Analysis & Simulation State
  const [analysisResult, setAnalysisResult] = useState(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [securityResult, setSecurityResult] = useState(null);
  const [freshnessResult, setFreshnessResult] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  // UI Flow State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Initial Status and Health Fetch
  const refreshSystemStatus = async () => {
    try {
      const [healthRes, infoRes] = await Promise.all([
        checkHealth().catch(err => ({ status: 'unreachable', error: err.message })),
        getAppInfo().catch(() => null)
      ]);
      setBackendHealth(healthRes);
      setAppInfo(infoRes);
    } catch (err) {
      console.error("System health check failed", err);
      setBackendHealth({ status: 'unreachable' });
    }

    try {
      const statusRes = await getDatabaseStatus();
      setDbStatus(statusRes);
    } catch {
      setDbStatus({
        connected: false,
        status: 'unreachable',
        message: 'PostgreSQL database is currently disconnected or unavailable.'
      });
    }
  };

  useEffect(() => {
    refreshSystemStatus();
  }, []);

  // Authentication Handlers
  const login = (email, password) => {
    // Note: Backend does not provide auth endpoints.
    // Client-side authentication verifies input requirements and stores session.
    const userObj = {
      email,
      name: email.split('@')[0],
      role: 'Software Analyst',
      loginTime: new Date().toISOString()
    };
    setCurrentUser(userObj);
    localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(userObj));
    return userObj;
  };

  const signup = (email, password, displayName = null) => {
    const userObj = {
      email,
      name: displayName || email.split('@')[0],
      role: 'Project Lead',
      loginTime: new Date().toISOString()
    };
    setCurrentUser(userObj);
    localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(userObj));
    return userObj;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_AUTH_KEY);
  };

  // Run Dependency Analysis
  const handleAnalyze = async (pkgJson, pkgLockJson) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSimulationResult(null);
    setSecurityResult(null);
    setFreshnessResult(null);
    setSelectedNode(null);

    try {
      const data = await analyzeProject(pkgJson, pkgLockJson);
      setAnalysisResult(data);
      if (data.analysis_id) {
        setCurrentAnalysisId(data.analysis_id);
      }
      return data;
    } catch (err) {
      console.error("Analysis failed", err);
      const detail = err.response?.data?.detail || err.message || "Failed to analyze project";
      setErrorMessage(detail);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Simulation Handlers
  const handleSimulationSuccess = (simRes) => {
    setSimulationResult(simRes);
    if (simRes.target_package) {
      setSelectedNode(simRes.target_package);
    }
  };

  const handleResetSimulation = () => {
    setSimulationResult(null);
  };

  // Load Historical Snapshot with Associated Security & Freshness Hydration
  const handleLoadSnapshot = async (historyDetailOrId) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSimulationResult(null);
    setSelectedNode(null);
    setSecurityResult(null);
    setFreshnessResult(null);

    try {
      let detail = null;
      let analysisId = null;

      if (typeof historyDetailOrId === 'string') {
        analysisId = historyDetailOrId;
        detail = await getAnalysisDetail(analysisId);
      } else if (historyDetailOrId && historyDetailOrId.id) {
        analysisId = historyDetailOrId.id;
        detail = historyDetailOrId;
        if (!detail.graph_snapshot) {
          detail = await getAnalysisDetail(analysisId);
        }
      } else if (historyDetailOrId?.graph_snapshot?.analysis_id) {
        analysisId = historyDetailOrId.graph_snapshot.analysis_id;
        detail = historyDetailOrId;
      }

      if (!detail || !detail.graph_snapshot) {
        throw new Error("Selected analysis record does not contain an accessible graph snapshot.");
      }

      const reconstructedAnalysis = {
        project_name: detail.project_name || detail.manifest_metadata?.package_name || detail.project_id,
        project_version: detail.project_version || '1.0.0',
        stats: {
          total_packages: detail.total_packages,
          direct_dependencies_count: detail.direct_dependencies_count,
          transitive_dependencies_count: detail.transitive_dependencies_count,
          total_dependency_edges: detail.total_dependency_edges,
          has_cycles: detail.has_cycles,
          cycle_count: detail.cycle_count,
          is_dag: detail.is_dag,
          root_package: detail.project_name || detail.manifest_metadata?.package_name || detail.project_id
        },
        nodes: detail.graph_snapshot.nodes,
        edges: detail.graph_snapshot.edges,
        cycles: detail.cycle_details || [],
        topological_order: detail.topological_order || [],
        analysis_id: analysisId
      };

      setAnalysisResult(reconstructedAnalysis);
      setCurrentAnalysisId(analysisId);

      // Restore graph snapshot into backend active memory cache so that simulation/inspector features operate on this snapshot
      try {
        await restoreAnalysisSnapshot(analysisId);
      } catch (restoreErr) {
        console.warn("Backend cache restoration non-critical warning:", restoreErr);
      }

      // Hydrate persisted security and freshness data for this exact analysis ID
      const [secRes, freshRes] = await Promise.allSettled([
        getAnalysisSecurity(analysisId),
        getAnalysisFreshness(analysisId)
      ]);

      const partialWarnings = [];

      if (secRes.status === 'fulfilled' && secRes.value) {
        setSecurityResult({
          ...secRes.value,
          analysis_id: analysisId
        });
      } else {
        setSecurityResult(null);
        const secStatus = secRes.reason?.response?.status;
        if (secStatus && secStatus !== 404) {
          partialWarnings.push(`Security records could not be loaded: ${secRes.reason?.response?.data?.detail || secRes.reason?.message}`);
        }
      }

      if (freshRes.status === 'fulfilled' && freshRes.value && freshRes.value.records && freshRes.value.records.length > 0) {
        setFreshnessResult({
          ...freshRes.value,
          analysis_id: analysisId
        });
      } else {
        setFreshnessResult(null);
        const freshStatus = freshRes.reason?.response?.status;
        if (freshStatus && freshStatus !== 404) {
          partialWarnings.push(`Freshness records could not be loaded: ${freshRes.reason?.response?.data?.detail || freshRes.reason?.message}`);
        }
      }

      if (partialWarnings.length > 0) {
        setErrorMessage(partialWarnings.join(' | '));
      }

      return reconstructedAnalysis;
    } catch (err) {
      console.error("Failed to load snapshot", err);
      const detail = err.response?.data?.detail || err.message || "Failed to load historical snapshot";
      setErrorMessage(detail);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Derived View Properties (Baseline vs Simulated Mode)
  const isSimulatedActive = Boolean(simulationResult);
  const displayNodes = isSimulatedActive ? simulationResult.simulated_analysis.nodes : (analysisResult?.nodes || []);
  const displayEdges = isSimulatedActive ? simulationResult.simulated_analysis.edges : (analysisResult?.edges || []);
  const displayStats = isSimulatedActive ? simulationResult.simulated_stats : (analysisResult?.stats || null);
  const displayCycles = isSimulatedActive ? simulationResult.simulated_analysis.cycles : (analysisResult?.cycles || []);
  const displayTopological = isSimulatedActive ? simulationResult.simulated_analysis.topological_order : (analysisResult?.topological_order || []);

  const value = {
    // Auth
    currentUser,
    isAuthenticated: Boolean(currentUser),
    login,
    signup,
    logout,

    // Status
    backendHealth,
    appInfo,
    dbStatus,
    refreshSystemStatus,

    // Analysis Data
    analysisResult,
    setAnalysisResult,
    currentAnalysisId,
    simulationResult,
    setSimulationResult,
    securityResult,
    setSecurityResult,
    freshnessResult,
    setFreshnessResult,
    selectedNode,
    setSelectedNode,

    // Actions
    handleAnalyze,
    handleSimulationSuccess,
    handleResetSimulation,
    handleLoadSnapshot,

    // Loading & Errors
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,

    // Computed
    isSimulatedActive,
    displayNodes,
    displayEdges,
    displayStats,
    displayCycles,
    displayTopological
  };

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
}
