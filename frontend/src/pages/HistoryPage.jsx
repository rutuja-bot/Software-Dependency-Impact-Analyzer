import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Database, 
  History, 
  ArrowRight, 
  CheckCircle2, 
  Layers,
  GitCommit 
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ProjectHistoryPanel from '../components/ProjectHistoryPanel';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { 
    handleLoadSnapshot, 
    analysisResult, 
    currentAnalysisId 
  } = useAnalysis();

  const handleSnapshotRestored = async (detail) => {
    await handleLoadSnapshot(detail);
  };

  return (
    <div className="space-y-6">
      {/* Active Loaded Snapshot Notice if present */}
      {analysisResult && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Active Loaded Project</div>
              <div className="text-sm font-bold text-white font-mono">
                {analysisResult.project_name} <span className="text-xs text-teal-400 font-sans font-normal">v{analysisResult.project_version}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/overview')}
            className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow transition"
          >
            <span>View Loaded Graph</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main History Panel */}
      <ProjectHistoryPanel 
        onLoadSnapshot={handleSnapshotRestored}
        currentProjectName={analysisResult?.project_name}
      />
    </div>
  );
}
