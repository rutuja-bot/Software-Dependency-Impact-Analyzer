import React, { useState, useRef } from 'react';
import {
  Upload,
  Play,
  FileJson,
  AlertCircle,
  RotateCcw,
  Check,
  FileCode,
  Lock,
  Sparkles,
  Github,
  Folder,
  FolderUp,
  FileArchive,
  CheckCircle2,
  Info,
  ArrowRight,
  Loader2,
  GitBranch,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';
import { importGitHubRepo, getGitHubRepoInfo, importProjectArchive } from '../services/api';

const SAMPLE_PACKAGE_JSON = {
  name: "sample-node-service",
  version: "1.2.0",
  dependencies: {
    "express": "^4.18.2",
    "dotenv": "^16.4.5",
    "winston": "^3.11.0"
  },
  devDependencies: {
    "jest": "^29.7.0"
  }
};

const SAMPLE_PACKAGE_LOCK = {
  name: "sample-node-service",
  version: "1.2.0",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "sample-node-service",
      version: "1.2.0",
      dependencies: {
        "dotenv": "^16.4.5",
        "express": "^4.18.2",
        "winston": "^3.11.0"
      }
    },
    "node_modules/dotenv": { "version": "16.4.5", "dependencies": {} },
    "node_modules/express": {
      "version": "4.18.2",
      "dependencies": {
        "accepts": "~1.3.8",
        "cookie": "0.5.0",
        "depd": "2.0.0"
      }
    },
    "node_modules/accepts": {
      "version": "1.3.8",
      "dependencies": { "mime-types": "~2.1.34" }
    },
    "node_modules/mime-types": { "version": "2.1.34", "dependencies": {} },
    "node_modules/cookie": { "version": "0.5.0", "dependencies": {} },
    "node_modules/depd": { "version": "2.0.0", "dependencies": {} },
    "node_modules/winston": {
      "version": "3.11.0",
      "dependencies": { "async": "^3.2.5" }
    },
    "node_modules/async": { "version": "3.2.5", "dependencies": {} }
  }
};

export default function ProjectUploader({ onAnalyze, onImportSuccess, isLoading }) {
  const shouldReduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState('github'); // 'github' | 'folder_zip' | 'manifest'

  // Tab 1: GitHub Import State
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [repoInfo, setRepoInfo] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [githubError, setGithubError] = useState(null);
  const [isGithubImporting, setIsGithubImporting] = useState(false);

  // Tab 2: Folder & ZIP Upload State
  const folderInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const [folderSummary, setFolderSummary] = useState(null);
  const [folderData, setFolderData] = useState(null); // { pkgJson, lockJson }
  const [zipFile, setZipFile] = useState(null);
  const [isDraggingZip, setIsDraggingZip] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isArchiveUploading, setIsArchiveUploading] = useState(false);

  // Tab 3: Direct Manifest State
  const [pkgText, setPkgText] = useState(JSON.stringify(SAMPLE_PACKAGE_JSON, null, 2));
  const [lockText, setLockText] = useState(JSON.stringify(SAMPLE_PACKAGE_LOCK, null, 2));
  const [includeLock, setIncludeLock] = useState(true);
  const [manifestError, setManifestError] = useState(null);

  // Success Notification State
  const [successBanner, setSuccessBanner] = useState(null);

  // -------------------------------------------------------------
  // TAB 1: GitHub Handlers & URL Verification
  // -------------------------------------------------------------
  const getRepoHostStatus = (urlStr) => {
    if (!urlStr || !urlStr.trim()) return null;
    let parsed;
    try {
      let raw = urlStr.trim();
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      parsed = new URL(raw);
    } catch {
      return { status: 'invalid', message: 'Invalid URL format' };
    }

    if (parsed.protocol !== 'https:') {
      return { status: 'external', message: 'External link - could be hazardous (HTTPS required)' };
    }

    if (parsed.username || parsed.password) {
      return { status: 'external', message: 'External link - could be hazardous (Credentials in URL not allowed)' };
    }

    if (parsed.port && parsed.port !== '' && parsed.port !== '443') {
      return { status: 'external', message: 'External link - could be hazardous (Custom ports not allowed)' };
    }

    let hostname = parsed.hostname.toLowerCase().trim();
    if (hostname.endsWith('.')) {
      hostname = hostname.slice(0, -1);
    }

    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (hostname === 'localhost' || ipv4Pattern.test(hostname) || hostname.startsWith('[') || hostname.endsWith(']')) {
      return { status: 'external', message: 'External link - could be hazardous (Localhost/IP not allowed)' };
    }

    if (hostname.includes('xn--')) {
      return { status: 'external', message: 'External link - could be hazardous (Punycode domains not allowed)' };
    }

    if (hostname === 'github.com') {
      return { status: 'verified', host: 'github.com' };
    }
    if (hostname === 'gitlab.com' || hostname === 'bitbucket.org') {
      return { status: 'unsupported', host: hostname, message: 'Verified platform, import not supported yet' };
    }

    return { status: 'external', message: 'External link - could be hazardous' };
  };

  const urlHostStatus = React.useMemo(() => getRepoHostStatus(repoUrl), [repoUrl]);

  const validateGitHubUrl = (url) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return "Please enter a GitHub repository URL.";
    const hostStatus = getRepoHostStatus(trimmed);
    if (!hostStatus || hostStatus.status === 'invalid') {
      return "Please enter a valid repository URL.";
    }
    if (hostStatus.status === 'unsupported') {
      return "Verified platform, import not supported yet.";
    }
    if (hostStatus.status === 'external') {
      return hostStatus.message || "External link - could be hazardous.";
    }
    if (hostStatus.status !== 'verified') {
      return "External link - could be hazardous.";
    }

    try {
      let raw = trimmed;
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
      }
      const parsed = new URL(raw);
      const cleanPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const parts = cleanPath.split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        return "Please enter a valid GitHub repository URL in owner/repo format (e.g. https://github.com/owner/repository).";
      }
      const repoName = parts[1].replace(/\.git$/i, '');
      const slugPattern = /^[a-zA-Z0-9_.-]+$/;
      if (!slugPattern.test(parts[0]) || !slugPattern.test(repoName)) {
        return "Invalid repository or owner name in URL.";
      }
    } catch {
      return "Invalid repository URL format.";
    }
    return null;
  };

  const handleInspectRepo = async () => {
    setGithubError(null);
    setRepoInfo(null);
    const validationErr = validateGitHubUrl(repoUrl);
    if (validationErr) {
      setGithubError(validationErr);
      return;
    }

    setIsInspecting(true);
    try {
      const currentToken = authToken ? authToken.trim() : null;
      const data = await getGitHubRepoInfo(repoUrl.trim(), currentToken);
      setRepoInfo(data);
      if (data.default_branch && !branch) {
        setBranch(data.default_branch);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to inspect GitHub repository.";
      setGithubError(msg);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleGitHubImport = async (e) => {
    e.preventDefault();
    setGithubError(null);
    const validationErr = validateGitHubUrl(repoUrl);
    if (validationErr) {
      setGithubError(validationErr);
      return;
    }

    setIsGithubImporting(true);
    const currentToken = authToken ? authToken.trim() : null;
    try {
      const result = await importGitHubRepo(repoUrl.trim(), branch.trim() || null, currentToken);
      setSuccessBanner({
        source: 'GitHub',
        title: result.project_name || 'Project',
        version: result.project_version,
        nodes: result.nodes?.length || 0,
        edges: result.edges?.length || 0
      });
      if (onImportSuccess) {
        onImportSuccess(result);
      } else if (onAnalyze) {
        onAnalyze(result.package_json, result.package_lock_json);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to import GitHub repository.";
      setGithubError(msg);
    } finally {
      setAuthToken('');
      setIsGithubImporting(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: Folder & ZIP Handlers
  // -------------------------------------------------------------
  const handleFolderSelect = async (e) => {
    setUploadError(null);
    setFolderSummary(null);
    setFolderData(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Look for package.json and optional package-lock.json
    // Prefer files at the shallowest path depth
    let pkgFile = null;
    let lockFile = null;
    let minPkgDepth = Infinity;
    let minLockDepth = Infinity;

    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const parts = relPath.split('/');
      const depth = parts.length;
      const name = parts[parts.length - 1].toLowerCase();

      if (name === 'package.json' && depth < minPkgDepth) {
        pkgFile = f;
        minPkgDepth = depth;
      } else if (name === 'package-lock.json' && depth < minLockDepth) {
        lockFile = f;
        minLockDepth = depth;
      }
    }

    if (!pkgFile) {
      setUploadError("No package.json file was found in the selected folder. A root package.json is required.");
      return;
    }

    try {
      const pkgTextContent = await pkgFile.text();
      const parsedPkg = JSON.parse(pkgTextContent);
      if (!parsedPkg.name) {
        setUploadError("The detected package.json is missing a required \"name\" property.");
        return;
      }

      let parsedLock = null;
      if (lockFile) {
        try {
          const lockTextContent = await lockFile.text();
          parsedLock = JSON.parse(lockTextContent);
        } catch {
          console.warn("Failed to parse package-lock.json in folder, continuing with package.json only");
        }
      }

      const folderName = files[0].webkitRelativePath?.split('/')[0] || "Selected Folder";
      setFolderSummary({
        folderName,
        totalFiles: files.length,
        pkgName: parsedPkg.name,
        pkgVersion: parsedPkg.version || "1.0.0",
        hasLockfile: Boolean(parsedLock),
        manifestPath: pkgFile.webkitRelativePath || pkgFile.name
      });
      setFolderData({ pkgJson: parsedPkg, lockJson: parsedLock });
    } catch (err) {
      setUploadError(`Failed to read folder manifests: ${err.message}`);
    }
  };

  const handleFolderAnalyze = () => {
    if (!folderData || !folderData.pkgJson) return;
    setUploadError(null);
    onAnalyze(folderData.pkgJson, folderData.lockJson);
    setSuccessBanner({
      source: 'Folder Import',
      title: folderData.pkgJson.name,
      version: folderData.pkgJson.version || '1.0.0',
      nodes: null,
      edges: null
    });
  };

  const handleZipFileChange = (file) => {
    setUploadError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadError("Only .zip archive files are accepted.");
      return;
    }
    const maxBytes = 50 * 1024 * 1024; // 50MB
    if (file.size > maxBytes) {
      setUploadError(`Archive exceeds maximum size limit of 50 MB (File is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }
    setZipFile(file);
  };

  const handleZipDrop = (e) => {
    e.preventDefault();
    setIsDraggingZip(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleZipFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleArchiveUpload = async () => {
    if (!zipFile) return;
    setUploadError(null);
    setIsArchiveUploading(true);

    try {
      const result = await importProjectArchive(zipFile);
      setSuccessBanner({
        source: 'ZIP Archive',
        title: result.project_name || zipFile.name,
        version: result.project_version,
        nodes: result.nodes?.length || 0,
        edges: result.edges?.length || 0
      });
      if (onImportSuccess) {
        onImportSuccess(result);
      } else if (onAnalyze) {
        onAnalyze(result.package_json, result.package_lock_json);
      }
      setZipFile(null);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Failed to extract or analyze archive.";
      setUploadError(msg);
    } finally {
      setIsArchiveUploading(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: Direct Manifest Handlers
  // -------------------------------------------------------------
  const handleLoadSample = () => {
    setPkgText(JSON.stringify(SAMPLE_PACKAGE_JSON, null, 2));
    setLockText(JSON.stringify(SAMPLE_PACKAGE_LOCK, null, 2));
    setIncludeLock(true);
    setManifestError(null);
  };

  const handleClear = () => {
    setPkgText('{\n  "name": "",\n  "version": "1.0.0",\n  "dependencies": {}\n}');
    setLockText('');
    setIncludeLock(false);
    setManifestError(null);
  };

  const handleManifestSubmit = (e) => {
    e.preventDefault();
    setManifestError(null);

    let parsedPkg;
    try {
      parsedPkg = JSON.parse(pkgText);
    } catch {
      setManifestError("Invalid JSON syntax in package.json. Please check commas, quotes, and brackets.");
      return;
    }

    if (!parsedPkg.name) {
      setManifestError("package.json must contain a valid \"name\" field.");
      return;
    }

    let parsedLock = null;
    if (includeLock && lockText.trim()) {
      try {
        parsedLock = JSON.parse(lockText);
      } catch {
        setManifestError("Invalid JSON syntax in package-lock.json. Please check commas, quotes, and brackets.");
        return;
      }
    }

    onAnalyze(parsedPkg, parsedLock);
  };

  return (
    <div className="bg-white dark:bg-[#172438] border border-slate-200/90 dark:border-[#26364D] rounded-2xl p-4 sm:p-6 shadow-2xs dark:shadow-card space-y-6 transition-colors duration-200">

      {/* Header and Import Tabs Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-[#26364D] pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#19B6A4] animate-pulse"></span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
              Multi-Source Project Ingestion
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-1">
            Import from public GitHub repositories, local directories, ZIP archives, or raw manifests.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-[#111C2E] rounded-xl border border-slate-200/80 dark:border-[#26364D] shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'github'
                ? 'bg-white dark:bg-[#172438] text-[#19B6A4] shadow-xs border border-slate-200/60 dark:border-[#26364D]'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Github className="w-4 h-4" />
            <span>GitHub Repository</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('folder_zip')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'folder_zip'
                ? 'bg-white dark:bg-[#172438] text-[#4C8DCE] shadow-xs border border-slate-200/60 dark:border-[#26364D]'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FolderUp className="w-4 h-4" />
            <span>Folder & ZIP Archive</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manifest')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'manifest'
                ? 'bg-white dark:bg-[#172438] text-[#19B6A4] shadow-xs border border-slate-200/60 dark:border-[#26364D]'
                : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Direct Manifest</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {successBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between p-4 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl text-emerald-800 dark:text-[#22C55E] text-sm"
          >
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#22C55E]" />
              <div>
                <span className="font-bold">Successfully imported from {successBanner.source}:</span>{' '}
                <span className="font-mono">{successBanner.title}</span> (v{successBanner.version})
                {successBanner.nodes !== null && (
                  <span className="ml-2 text-xs opacity-90 font-mono">
                    [{successBanner.nodes} packages, {successBanner.edges} dependency edges]
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              className="text-xs font-semibold px-2 py-1 rounded bg-[#22C55E]/20 hover:bg-[#22C55E]/30"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* TAB 1: GITHUB IMPORT */}
      {/* ========================================================= */}
      {activeTab === 'github' && (
        <div className="space-y-5">
          <AnimatePresence>
            {githubError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start space-x-2.5 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{githubError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleGitHubImport} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                    <Github className="w-4 h-4 text-[#19B6A4]" />
                    <span>GitHub Repository URL <span className="text-[#F05252]">*</span></span>
                  </label>
                  {urlHostStatus?.status === 'verified' && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded border border-[#22C55E]/30">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Verified: {urlHostStatus.host}</span>
                    </span>
                  )}
                  {urlHostStatus?.status === 'unsupported' && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded border border-[#F59E0B]/30">
                      <AlertCircle className="w-3 h-3" />
                      <span>Verified platform, import not supported yet</span>
                    </span>
                  )}
                  {urlHostStatus?.status === 'external' && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#F05252] bg-[#F05252]/10 px-2 py-0.5 rounded border border-[#F05252]/30">
                      <AlertCircle className="w-3 h-3" />
                      <span>External link - could be hazardous</span>
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/expressjs/express"
                    className="flex-1 bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4]"
                    spellCheck="false"
                  />
                  <button
                    type="button"
                    onClick={handleInspectRepo}
                    disabled={isInspecting || !repoUrl.trim()}
                    className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-[#111C2E] dark:hover:bg-[#172438] text-slate-700 dark:text-[#F1F5F9] border border-slate-300 dark:border-[#26364D] disabled:opacity-50 transition"
                  >
                    {isInspecting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#19B6A4]" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-[#19B6A4]" />
                    )}
                    <span>Inspect</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                  <GitBranch className="w-4 h-4 text-[#4C8DCE]" />
                  <span>Branch or Tag (Optional)</span>
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder={repoInfo?.default_branch || "main / master"}
                  className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#4C8DCE]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                <Lock className="w-4 h-4 text-[#4C8DCE]" />
                <span>Personal Access Token (Optional, for private repositories)</span>
              </label>
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                autoComplete="off"
                className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#4C8DCE]"
              />
            </div>

            {/* Inspected Repo Details Preview */}
            {repoInfo && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 dark:bg-[#111C2E] border border-[#19B6A4]/30 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Github className="w-4 h-4 text-[#19B6A4]" />
                    <span className="font-bold text-slate-900 dark:text-[#F1F5F9] font-mono text-sm">
                      {repoInfo.full_name}
                    </span>
                    <span className="text-xs bg-[#19B6A4]/10 text-[#19B6A4] px-2 py-0.5 rounded font-mono border border-[#19B6A4]/30">
                      Branch: {repoInfo.default_branch}
                    </span>
                    {repoInfo.latest_commit_sha && (
                      <span className="text-xs bg-slate-200 dark:bg-[#172438] text-slate-600 dark:text-[#94A3B8] px-2 py-0.5 rounded font-mono">
                        SHA: {repoInfo.latest_commit_sha.slice(0, 7)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-xs">
                    <span className={`px-2 py-0.5 rounded font-semibold ${
                      repoInfo.has_package_json
                        ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30'
                        : 'bg-[#F05252]/10 text-[#F05252] border border-[#F05252]/30'
                    }`}>
                      {repoInfo.has_package_json ? 'package.json found' : 'No package.json'}
                    </span>
                    <span className={`px-2 py-0.5 rounded font-semibold ${
                      repoInfo.has_lockfile
                        ? 'bg-[#4C8DCE]/10 text-[#4C8DCE] border border-[#4C8DCE]/30'
                        : 'bg-slate-200 dark:bg-[#172438] text-slate-500 dark:text-[#94A3B8]'
                    }`}>
                      {repoInfo.has_lockfile ? 'Lockfile detected' : 'No lockfile (direct only)'}
                    </span>
                  </div>
                </div>

                {repoInfo.description && (
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                    {repoInfo.description}
                  </p>
                )}
              </motion.div>
            )}

            {/* Private Repo Notice */}
            <div className="flex items-start space-x-2.5 text-xs text-slate-500 dark:text-[#94A3B8] bg-slate-50 dark:bg-[#111C2E]/60 p-3 rounded-xl border border-slate-200/80 dark:border-[#26364D]">
              <Info className="w-4 h-4 shrink-0 text-[#4C8DCE] mt-0.5" />
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Public & Private Repositories:</span> Public repositories are fetched directly from GitHub's API. Private repositories require an optional Personal Access Token (PAT) with read access. Tokens are kept in memory only and never stored.
              </div>
            </div>

            {/* GitHub Import Action */}
            <div className="flex items-center justify-end pt-2">
              <motion.button
                type="submit"
                disabled={isGithubImporting || !repoUrl.trim()}
                whileHover={isGithubImporting ? {} : { scale: 1.02 }}
                whileTap={isGithubImporting ? {} : { scale: 0.98 }}
                className="flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] disabled:opacity-50 disabled:cursor-not-allowed text-[#0B1220] font-bold text-sm px-6 py-2.5 rounded-xl shadow-glow-teal transition duration-200"
              >
                {isGithubImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Fetching & Building Graph...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Import Repository & Build Graph</span>
                  </>
                )}
              </motion.button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: FOLDER & ZIP ARCHIVE UPLOAD */}
      {/* ========================================================= */}
      {activeTab === 'folder_zip' && (
        <div className="space-y-6">
          <AnimatePresence>
            {uploadError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start space-x-2.5 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Section A: Local Folder Picker */}
            <div className="flex flex-col justify-between bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-2xl p-5 space-y-4">
              <div>
                <div className="flex items-center space-x-2.5 text-slate-900 dark:text-[#F1F5F9] font-bold text-base">
                  <div className="p-2 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/30">
                    <Folder className="w-5 h-5 text-[#19B6A4]" />
                  </div>
                  <span>Local Project Directory</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-2 leading-relaxed">
                  Select a local project folder directly via the browser. Automatically scans and extracts <code className="text-[#19B6A4] font-mono">package.json</code> and lockfiles in-memory without uploading unrelated code files.
                </p>
              </div>

              {/* Hidden webkitdirectory input */}
              <input
                type="file"
                ref={folderInputRef}
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={handleFolderSelect}
              />

              {folderSummary ? (
                <div className="bg-white dark:bg-[#172438] border border-[#19B6A4]/30 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800 dark:text-[#F1F5F9]">
                    <span className="font-mono text-sm text-[#19B6A4]">{folderSummary.folderName}</span>
                    <span className="text-slate-500 dark:text-[#94A3B8]">{folderSummary.totalFiles} files</span>
                  </div>
                  <div className="text-slate-600 dark:text-[#94A3B8] flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#26364D]">
                    <span>Manifest: <strong className="text-slate-800 dark:text-[#F1F5F9]">{folderSummary.pkgName} (v{folderSummary.pkgVersion})</strong></span>
                    <span className="text-[#22C55E] font-semibold">Ready</span>
                  </div>
                  {folderSummary.hasLockfile && (
                    <div className="text-xs text-[#4C8DCE] flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Transitive lockfile detected</span>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-200 dark:bg-[#172438] hover:bg-slate-300 dark:hover:bg-[#26364D] text-slate-800 dark:text-[#F1F5F9] border border-slate-300 dark:border-[#26364D] transition"
                >
                  {folderSummary ? 'Choose Different Folder' : 'Browse Local Folder'}
                </button>

                {folderSummary && (
                  <button
                    type="button"
                    onClick={handleFolderAnalyze}
                    disabled={isLoading}
                    className="flex items-center space-x-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#19B6A4] hover:bg-[#159e8e] text-[#0B1220] transition shadow-glow-teal disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    <span>Analyze Folder</span>
                  </button>
                )}
              </div>
            </div>

            {/* Section B: Safe ZIP Archive Upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingZip(true); }}
              onDragLeave={() => setIsDraggingZip(false)}
              onDrop={handleZipDrop}
              className={`flex flex-col justify-between border-2 border-dashed rounded-2xl p-5 space-y-4 transition ${
                isDraggingZip
                  ? 'border-[#4C8DCE] bg-[#4C8DCE]/10'
                  : 'border-slate-300 dark:border-[#26364D] bg-slate-50 dark:bg-[#111C2E]'
              }`}
            >
              <div>
                <div className="flex items-center space-x-2.5 text-slate-900 dark:text-[#F1F5F9] font-bold text-base">
                  <div className="p-2 bg-[#4C8DCE]/10 text-[#4C8DCE] rounded-xl border border-[#4C8DCE]/30">
                    <FileArchive className="w-5 h-5 text-[#4C8DCE]" />
                  </div>
                  <span>ZIP Project Archive</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-2 leading-relaxed">
                  Drop a <code className="text-[#4C8DCE] font-mono">.zip</code> project archive here (up to 50 MB). Extracted server-side with strict path traversal & zip-bomb protection.
                </p>
              </div>

              <input
                type="file"
                ref={zipInputRef}
                accept=".zip"
                className="hidden"
                onChange={(e) => handleZipFileChange(e.target.files?.[0])}
              />

              {zipFile ? (
                <div className="bg-white dark:bg-[#172438] border border-[#4C8DCE]/40 rounded-xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800 dark:text-[#F1F5F9]">
                    <span className="font-mono text-sm text-[#4C8DCE] truncate max-w-[200px]">{zipFile.name}</span>
                    <span className="text-slate-500 dark:text-[#94A3B8]">{(zipFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="text-[#22C55E] flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Archive selected and ready for extraction</span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => zipInputRef.current?.click()}
                  className="cursor-pointer text-center py-4 border border-dashed border-slate-300 dark:border-[#26364D] rounded-xl hover:bg-slate-100/50 dark:hover:bg-[#172438]/50 transition"
                >
                  <Upload className="w-6 h-6 mx-auto text-slate-400 dark:text-[#64748B] mb-1" />
                  <span className="text-xs text-slate-600 dark:text-[#94A3B8] font-medium">
                    Click to select .zip or drag & drop file
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-200 dark:bg-[#172438] hover:bg-slate-300 dark:hover:bg-[#26364D] text-slate-800 dark:text-[#F1F5F9] border border-slate-300 dark:border-[#26364D] transition"
                >
                  {zipFile ? 'Change Archive' : 'Choose ZIP File'}
                </button>

                {zipFile && (
                  <button
                    type="button"
                    onClick={handleArchiveUpload}
                    disabled={isArchiveUploading}
                    className="flex items-center space-x-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#4C8DCE] hover:bg-[#3b78b5] text-white transition shadow-glow-sm disabled:opacity-50"
                  >
                    {isArchiveUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Extracting & Building...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Upload & Analyze</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: DIRECT MANIFEST INPUT */}
      {/* ========================================================= */}
      {activeTab === 'manifest' && (
        <div className="space-y-5">
          <div className="flex items-center justify-end space-x-2">
            <motion.button
              type="button"
              onClick={handleClear}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              className="text-xs sm:text-sm text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-[#26364D] hover:bg-slate-100 dark:hover:bg-[#111C2E] transition duration-150"
            >
              Clear Fields
            </motion.button>
            <motion.button
              type="button"
              onClick={handleLoadSample}
              whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}
              className="flex items-center space-x-1.5 text-xs sm:text-sm font-semibold text-[#19B6A4] bg-[#19B6A4]/10 hover:bg-[#19B6A4]/20 px-3.5 py-1.5 rounded-xl border border-[#19B6A4]/30 transition shadow-2xs duration-150"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Load Sample Manifest</span>
            </motion.button>
          </div>

          <AnimatePresence>
            {manifestError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: easeSoft }}
                className="flex items-start space-x-2.5 text-sm text-[#F05252] bg-[#F05252]/10 p-3.5 rounded-xl border border-[#F05252]/25 overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#F05252] mt-0.5" />
                <span>{manifestError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleManifestSubmit} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* package.json editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                    <FileJson className="w-4 h-4 text-[#19B6A4]" />
                    <span>package.json <span className="text-[#F05252]">*</span></span>
                  </label>
                  <span className="text-xs font-mono text-slate-400 dark:text-[#64748B]">Root & Direct Dependencies</span>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-[#26364D] focus-within:border-[#19B6A4]/60 bg-slate-50 dark:bg-[#111C2E] transition duration-200">
                  <textarea
                    rows={10}
                    value={pkgText}
                    onChange={(e) => setPkgText(e.target.value)}
                    className="w-full bg-transparent p-3.5 text-sm font-mono text-slate-800 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none resize-none leading-relaxed"
                    placeholder="Paste package.json contents..."
                    spellCheck="false"
                  />
                </div>
              </div>

              {/* package-lock.json editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800 dark:text-[#F1F5F9] flex items-center space-x-1.5">
                    <Lock className="w-4 h-4 text-[#4C8DCE]" />
                    <span>package-lock.json (Optional)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-sm text-slate-700 dark:text-[#94A3B8] cursor-pointer bg-slate-100 dark:bg-[#111C2E] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-[#26364D]">
                    <input
                      type="checkbox"
                      checked={includeLock}
                      onChange={(e) => setIncludeLock(e.target.checked)}
                      className="rounded bg-white dark:bg-[#172438] border-slate-300 dark:border-[#26364D] text-[#19B6A4] focus:ring-0 cursor-pointer"
                    />
                    <span className="font-medium text-xs sm:text-[13px]">Include Lockfile</span>
                  </label>
                </div>

                <div className={`relative rounded-2xl overflow-hidden border border-slate-300 dark:border-[#26364D] focus-within:border-[#4C8DCE]/60 bg-slate-50 dark:bg-[#111C2E] transition duration-200 ${
                  !includeLock ? 'opacity-40 cursor-not-allowed' : ''
                }`}>
                  <textarea
                    rows={10}
                    disabled={!includeLock}
                    value={lockText}
                    onChange={(e) => setLockText(e.target.value)}
                    className="w-full bg-transparent p-3.5 text-sm font-mono text-slate-800 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none resize-none leading-relaxed"
                    placeholder="Paste package-lock.json (v1, v2, or v3) to resolve full transitive dependency sub-trees..."
                    spellCheck="false"
                  />
                </div>
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-[#26364D]">
              <div className="text-xs sm:text-[13px] text-slate-500 dark:text-[#94A3B8] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#19B6A4] animate-pulse"></span>
                <span>Supports NPM v1, v2, and v3 lockfiles with full nested dependency resolution.</span>
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={isLoading ? {} : { scale: 1.02 }}
                whileTap={isLoading ? {} : { scale: 0.98 }}
                className="flex items-center space-x-2 bg-[#19B6A4] hover:bg-[#159e8e] disabled:opacity-50 disabled:cursor-not-allowed text-[#0B1220] font-bold text-sm px-6 py-2.5 rounded-xl shadow-glow-teal transition duration-200"
              >
                <Play className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Constructing Directed Graph...' : 'Analyze & Build Graph'}</span>
              </motion.button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
