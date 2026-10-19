import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export const checkHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

export const getAppInfo = async () => {
  const response = await api.get('/info');
  return response.data;
};

export const analyzeProject = async (packageJson, packageLockJson = null) => {
  const payload = {
    package_json: packageJson,
    package_lock_json: packageLockJson,
  };
  const response = await api.post('/analyze', payload);
  return response.data;
};

export const getDownstreamImpact = async (targetPackage, analysisId = null) => {
  const params = { target_package: targetPackage };
  if (analysisId) params.analysis_id = analysisId;
  const response = await api.get('/impact', { params });
  return response.data;
};

export const simulateChange = async (operation, targetPackage, sourcePackage = null, version = null, depType = 'direct', analysisId = null) => {
  const payload = {
    operation,
    target_package: targetPackage,
    source_package: sourcePackage,
    version,
    dep_type: depType,
  };
  const params = analysisId ? { analysis_id: analysisId } : {};
  const response = await api.post('/simulate', payload, { params });
  return response.data;
};

export const scanSecurity = async (analysisId = null) => {
  const params = analysisId ? { analysis_id: analysisId } : {};
  const response = await api.post('/security/scan', null, { params });
  return response.data;
};

export const analyzeFreshness = async (retryFailed = false, analysisId = null) => {
  const params = {};
  if (retryFailed) params.retry_failed = true;
  if (analysisId) params.analysis_id = analysisId;
  const response = await api.post('/freshness/analyze', null, { params });
  return response.data;
};

// --- Phase 4 Persistence & History API ---

export const getDatabaseStatus = async () => {
  const response = await api.get('/projects/status');
  return response.data;
};

export const listProjects = async (limit = 50, offset = 0) => {
  const response = await api.get('/projects', { params: { limit, offset } });
  return response.data;
};

export const createProject = async (name, ecosystem = 'npm', description = null) => {
  const response = await api.post('/projects', { name, ecosystem, description });
  return response.data;
};

export const getProjectAnalyses = async (projectId, limit = 50, offset = 0) => {
  const response = await api.get(`/projects/${projectId}/analyses`, { params: { limit, offset } });
  return response.data;
};

export const getProjectSimulations = async (projectId, limit = 50, offset = 0) => {
  const response = await api.get(`/projects/${projectId}/simulations`, { params: { limit, offset } });
  return response.data;
};

export const getAnalysisDetail = async (analysisId) => {
  const response = await api.get(`/analyses/${analysisId}`);
  return response.data;
};

export const getAnalysisSnapshot = async (analysisId) => {
  const response = await api.get(`/analyses/${analysisId}/snapshot`);
  return response.data;
};

export const getAnalysisSecurity = async (analysisId) => {
  const response = await api.get(`/analyses/${analysisId}/security`);
  return response.data;
};

export const getAnalysisFreshness = async (analysisId) => {
  const response = await api.get(`/analyses/${analysisId}/freshness`);
  return response.data;
};

export const restoreAnalysisSnapshot = async (analysisId) => {
  const response = await api.post(`/analyses/${analysisId}/restore`);
  return response.data;
};


