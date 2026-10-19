import React from 'react';
import { 
  HashRouter, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import AnalyzePage from './pages/AnalyzePage';
import SecurityPage from './pages/SecurityPage';
import FreshnessPage from './pages/FreshnessPage';
import SimulationPage from './pages/SimulationPage';
import HistoryPage from './pages/HistoryPage';
import InspectorPage from './pages/InspectorPage';

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
  );
}

export default function App() {
  return (
    <AnalysisProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AnalysisProvider>
  );
}
