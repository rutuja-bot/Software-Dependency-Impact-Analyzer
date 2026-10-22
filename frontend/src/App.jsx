import React, { Suspense, lazy } from 'react';
import { 
  HashRouter, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import Layout from './components/Layout';
import { Loader2 } from 'lucide-react';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const AnalyzePage = lazy(() => import('./pages/AnalyzePage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const FreshnessPage = lazy(() => import('./pages/FreshnessPage'));
const SimulationPage = lazy(() => import('./pages/SimulationPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const InspectorPage = lazy(() => import('./pages/InspectorPage'));

function PageFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
      <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Loading module...</span>
    </div>
  );
}

class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Failed to load application chunk:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-6 text-center text-slate-300">
          <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-6 max-w-md shadow-lg space-y-3">
            <div className="text-rose-400 font-bold text-sm">Failed to Load Application Module</div>
            <p className="text-xs text-slate-400">
              A network error or asset update prevented this page from loading. You can retry loading the module.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Guard component: redirects unauthenticated users to /login
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAnalysis();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Redirect authenticated users away from /login to /overview
function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAnalysis();
  if (isAuthenticated) {
    return <Navigate to="/overview" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public Login / Sign-up Route */}
        <Route 
          path="/login" 
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          } 
        />

        {/* Protected Dashboard / Analyzer Routes */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="freshness" element={<FreshnessPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="inspector" element={<InspectorPage />} />
        </Route>

        {/* Fallback Catch-All */}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AnalysisProvider>
      <HashRouter>
        <ChunkErrorBoundary>
          <AppRoutes />
        </ChunkErrorBoundary>
      </HashRouter>
    </AnalysisProvider>
  );
}
