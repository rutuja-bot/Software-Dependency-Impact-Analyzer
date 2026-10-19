import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  Network, 
  LayoutDashboard, 
  FileJson, 
  ShieldAlert, 
  Clock, 
  Sparkles, 
  Database, 
  Activity, 
  LogOut, 
  User, 
  AlertTriangle, 
  XCircle,
  GitCommit,
  CheckCircle2
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';

export default function Layout() {
  const navigate = useNavigate();
  const { 
    currentUser, 
    logout, 
    backendHealth, 
    dbStatus, 
    errorMessage, 
    analysisResult,
    simulationResult,
    securityResult,
    freshnessResult,
    isSimulatedActive,
    displayStats
  } = useAnalysis();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    {
      to: '/overview',
      label: 'Overview',
      icon: LayoutDashboard,
      badge: displayStats?.total_packages ? `${displayStats.total_packages} pkgs` : null,
      badgeColor: 'bg-slate-800 text-slate-300'
    },
    {
      to: '/analyze',
      label: 'Analyze Dependencies',
      icon: FileJson,
      badge: null
    },
    {
      to: '/security',
      label: 'Security Analysis',
      icon: ShieldAlert,
      badge: securityResult?.vulnerable_packages_count > 0 
        ? `${securityResult.vulnerable_packages_count} vulns` 
        : (securityResult ? 'Clean' : null),
      badgeColor: securityResult?.vulnerable_packages_count > 0 
        ? 'bg-rose-500/20 text-rose-300' 
        : 'bg-emerald-500/20 text-emerald-300'
    },
    {
      to: '/freshness',
      label: 'Freshness / LibYear',
      icon: Clock,
      badge: freshnessResult?.project_total_libyear 
        ? `${Number(freshnessResult.project_total_libyear).toFixed(1)}y` 
        : null,
      badgeColor: 'bg-sky-500/20 text-sky-300'
    },
    {
      to: '/simulation',
      label: 'What-If Simulation',
      icon: Sparkles,
      badge: isSimulatedActive ? 'Simulated' : null,
      badgeColor: 'bg-indigo-500/20 text-indigo-300'
    },
    {
      to: '/history',
      label: 'Project History',
      icon: Database,
      badge: dbStatus?.total_analyses ? `${dbStatus.total_analyses} runs` : null,
      badgeColor: 'bg-slate-800 text-slate-400'
    },
    {
      to: '/inspector',
      label: 'Package Inspector',
      icon: Activity,
      badge: null
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navigation Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Project Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg border border-teal-500/20">
              <Network className="w-6 h-6 text-teal-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Software Dependency Impact Analyzer</h1>
              <p className="text-xs text-slate-400">Graph-Based Change Impact & What-If Simulation Engine</p>
            </div>
          </div>

          {/* Right Header Statuses & User Session */}
          <div className="flex items-center space-x-3 text-xs">
            {/* Backend Health Badge */}
            {backendHealth?.status === 'healthy' ? (
              <div className="hidden sm:flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>API Connected (v{backendHealth.version || '1.0.0'})</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-full font-medium">
                <XCircle className="w-3.5 h-3.5" />
                <span>Backend Offline</span>
              </div>
            )}

            {/* Database Persistence Status Badge */}
            {dbStatus?.connected ? (
              <div className="hidden md:flex items-center space-x-1.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                <span>PostgreSQL Active ({dbStatus.total_projects || 0} projects)</span>
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1.5 rounded-full font-medium">
                <span>Database Standby</span>
              </div>
            )}

            {/* Current User Session & Logout */}
            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
                <div className="hidden lg:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-200">{currentUser.name || currentUser.email}</span>
                  <span className="text-[10px] text-teal-400 font-mono">{currentUser.role || 'Analyst'} (Local Session)</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out of analyst workspace"
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 text-slate-300 border border-slate-700 hover:border-rose-800/60 px-2.5 py-1.5 rounded-lg transition text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body with Persistent Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Persistent Left Sidebar */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 p-4 space-y-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Active Project Card in Sidebar */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center space-x-1">
                <GitCommit className="w-3 h-3 text-teal-400" />
                <span>Active Project</span>
              </div>
              <div className="font-bold text-white text-xs truncate font-mono">
                {analysisResult?.project_name || 'No Project Analyzed'}
              </div>
              {analysisResult && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                  <span>Version: v{analysisResult.project_version}</span>
                  <span className="text-teal-400 font-mono font-medium">{displayStats?.total_packages || 0} pkgs</span>
                </div>
              )}
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 pb-2">
                Analyzer Navigation
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-xl transition text-xs font-medium ${
                        isActive
                          ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`
                    }
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer Metadata */}
          <div className="pt-4 border-t border-slate-800 space-y-2 text-[11px] text-slate-500">
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-slate-400 block font-semibold">Graph Convention:</span>
              <span className="font-mono text-teal-400">A &rarr; B (A depends on B)</span>
            </div>
            {isSimulatedActive && (
              <div className="flex items-center space-x-1.5 text-indigo-400 font-semibold bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulation Diff Active</span>
              </div>
            )}
          </div>
        </aside>

        {/* Central Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-900/95 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Global Error Banner */}
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <div>
                <div className="font-semibold text-sm">System Alert / Request Failed</div>
                <div className="text-xs">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Active Route Content */}
          <Outlet />
        </main>
      </div>

      {/* Global Application Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/80 py-3 text-center text-xs text-slate-500">
        Software Dependency Impact Analyzer &bull; B.Tech Computer Science Project &bull; Directed Graph & DSA Architecture
      </footer>
    </div>
  );
}
