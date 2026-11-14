import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
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
  CheckCircle2,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Server,
  Terminal,
  Cpu,
  Search,
  Command,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ThemeToggle from './ThemeToggle';
import QuickSearchModal from './QuickSearchModal';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dep_analyzer_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

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

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dep_analyzer_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navSections = [
    {
      title: 'Analysis & Graph',
      items: [
        {
          to: '/overview',
          label: 'Overview Dashboard',
          icon: LayoutDashboard,
          badge: displayStats?.total_packages ? `${displayStats.total_packages} pkgs` : null,
          badgeColor: 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
        },
        {
          to: '/analyze',
          label: 'Analyze Manifest',
          icon: FileJson,
          badge: null
        },
        {
          to: '/inspector',
          label: 'Package Inspector',
          icon: Activity,
          badge: null
        }
      ]
    },
    {
      title: 'Security & Freshness',
      items: [
        {
          to: '/security',
          label: 'Security Analysis',
          icon: ShieldAlert,
          badge: securityResult?.vulnerable_packages_count > 0
            ? `${securityResult.vulnerable_packages_count} vulns`
            : (securityResult ? 'Clean' : null),
          badgeColor: securityResult?.vulnerable_packages_count > 0
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        },
        {
          to: '/freshness',
          label: 'Freshness / LibYear',
          icon: Clock,
          badge: freshnessResult?.project_total_libyear
            ? `${Number(freshnessResult.project_total_libyear).toFixed(1)}y`
            : null,
          badgeColor: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30'
        },
        {
          to: '/simulation',
          label: 'What-If Simulation',
          icon: Sparkles,
          badge: isSimulatedActive ? 'Simulated' : null,
          badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
        }
      ]
    },
    {
      title: 'Persistence & Audit',
      items: [
        {
          to: '/history',
          label: 'Project History',
          icon: Database,
          badge: dbStatus?.total_analyses ? `${dbStatus.total_analyses} runs` : null,
          badgeColor: 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
        }
      ]
    }
  ];

  // Helper for current route title
  const currentPath = location.pathname;
  let pageTitle = 'Dashboard';
  if (currentPath.includes('analyze')) pageTitle = 'Analyze Dependencies';
  else if (currentPath.includes('security')) pageTitle = 'Security Vulnerabilities';
  else if (currentPath.includes('freshness')) pageTitle = 'LibYear Freshness';
  else if (currentPath.includes('simulation')) pageTitle = 'What-If Simulation';
  else if (currentPath.includes('history')) pageTitle = 'Project History';
  else if (currentPath.includes('inspector')) pageTitle = 'Package Inspector';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-[#080c16] dark:text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-900 dark:selection:text-cyan-200 transition-colors duration-200">

      {/* Quick Command / Search Modal */}
      <QuickSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />

      {/* Top Navigation Header */}
      <header className="border-b border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-[#0c111e]/90 backdrop-blur-md sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          {/* Logo & Project Title */}
          <div className="flex items-center space-x-3.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/70 transition"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <motion.div
              onClick={() => navigate('/overview')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
              className="flex items-center space-x-3 cursor-pointer group"
            >
              <div className="relative p-2.5 bg-gradient-to-br from-cyan-500/20 to-teal-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/30 shadow-glow-sm group-hover:border-cyan-400/50 transition duration-300">
                <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-ping opacity-75"></span>
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400"></span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition duration-200">
                    Software Dependency Impact Analyzer
                  </h1>
                  <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25">
                    DSA Graph Engine
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                  Directed Graph Impact Analysis &bull; What-If Simulation &bull; LibYear Lag &bull; OSV Security
                </p>
              </div>
            </motion.div>
          </div>

          {/* Quick Search Trigger Bar */}
          <div className="hidden md:flex flex-1 max-w-md mx-2">
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="w-full flex items-center justify-between bg-slate-100/80 hover:bg-slate-200/70 dark:bg-[#070b14] dark:hover:bg-slate-900 border border-slate-200 dark:border-white/[0.08] hover:border-cyan-500/40 text-slate-500 dark:text-slate-400 px-3.5 py-1.5 rounded-xl text-xs transition duration-150 group shadow-2xs"
            >
              <div className="flex items-center space-x-2">
                <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 transition" />
                <span className="truncate">Quick search packages & views...</span>
              </div>
              <div className="flex items-center space-x-1 font-mono text-[10px] bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                <span>Ctrl K</span>
              </div>
            </button>
          </div>

          {/* Right Header Statuses & User Session */}
          <div className="flex items-center space-x-3 text-xs shrink-0">
            {/* Backend Health Status Badge */}
            {backendHealth?.status === 'healthy' ? (
              <div className="hidden sm:flex items-center space-x-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-[11px]">API v{backendHealth.version || '0.1.0'}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-full font-medium">
                <XCircle className="w-3.5 h-3.5" />
                <span>Backend Disconnected</span>
              </div>
            )}

            {/* Database Status Badge */}
            {dbStatus?.connected ? (
              <div className="hidden md:flex items-center space-x-2 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="font-mono text-[11px]">{dbStatus.total_projects || 0} Projects Persisted</span>
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60 px-3 py-1.5 rounded-full font-medium">
                <Cpu className="w-3.5 h-3.5" />
                <span>In-Memory Mode</span>
              </div>
            )}

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* User Session & Sign Out */}
            {currentUser && (
              <div className="flex items-center space-x-2.5 pl-2 border-l border-slate-200 dark:border-white/[0.08]">
                <div className="hidden lg:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{currentUser.name || currentUser.email}</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono font-medium">{currentUser.role || 'Analyst'}</span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs ring-1 ring-white/10">
                  {(currentUser.name || currentUser.email || 'A').charAt(0).toUpperCase()}
                </div>
                <motion.button
                  type="button"
                  onClick={handleLogout}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
                  title="Sign out of analyst workspace"
                  className="flex items-center space-x-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 border border-slate-300/80 hover:border-rose-300 dark:bg-slate-800/80 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:text-slate-300 dark:border-slate-700/80 dark:hover:border-rose-700/60 px-2.5 py-1.5 rounded-xl transition text-xs shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </motion.button>
              </div>
            )}
          </div>
        </div>

        {/* Breadcrumb / Sub-bar */}
        <div className="bg-slate-100/70 dark:bg-[#0a0e19] border-t border-slate-200/70 dark:border-white/[0.04] px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-mono text-[11px]">Workspace</span>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />
            <span className="text-slate-800 dark:text-slate-200 font-semibold">{pageTitle}</span>
            {analysisResult && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />
                <span className="font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 px-2.5 py-0.5 rounded-md border border-cyan-200 dark:border-cyan-800/40 font-semibold text-[11px]">
                  {analysisResult.project_name} @ v{analysisResult.project_version}
                </span>
              </>
            )}
          </div>

          {/* Graph Notation - Responsive Compact Badge on Mobile, Full on Desktop */}
          <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 ml-auto shrink-0">
            <span className="hidden sm:inline">Graph Notation:</span>
            <span
              className="text-cyan-700 dark:text-cyan-400 font-semibold bg-white dark:bg-slate-900/90 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 shadow-2xs text-[10px] sm:text-[11px]"
              title="Directed Graph Notation: Package A depends on Package B"
            >
              <span className="hidden sm:inline">A &rarr; B (A depends on B)</span>
              <span className="sm:hidden font-mono">A &rarr; B</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Mobile Backdrop Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-xs lg:hidden"
              aria-label="Close navigation menu"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setMobileMenuOpen(false);
                }
              }}
            />
          )}
        </AnimatePresence>

        {/* Left Sidebar (Full w-72 Drawer on Mobile, Collapsible lg:w-20/lg:w-64 on Desktop) */}
        <aside className={`
          ${mobileMenuOpen ? 'fixed inset-y-16 left-0 z-40 w-72 bg-white dark:bg-[#0c111e] shadow-2xl' : 'hidden lg:flex'}
          ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
          bg-white dark:bg-[#0c111e] border-r border-slate-200/90 dark:border-white/[0.08] flex flex-col justify-between shrink-0 p-3.5 space-y-6 overflow-y-auto transition-all duration-200
        `}>
          <div className="space-y-5">

            {/* Sidebar Collapse Toggle (Desktop Only) */}
            <div className="hidden lg:flex items-center justify-between pb-1 border-b border-slate-200/80 dark:border-white/[0.06]">
              {!sidebarCollapsed && (
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
                  Navigation
                </span>
              )}
              <button
                type="button"
                onClick={toggleSidebar}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition ml-auto"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {/* Active Project Card */}
            <div className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-[#111726] dark:to-[#0c111e] border border-slate-200 dark:border-white/[0.08] rounded-2xl p-3.5 space-y-2 shadow-2xs dark:shadow-card ${
              sidebarCollapsed ? 'block lg:hidden' : 'block'
            }`}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                <span className="flex items-center space-x-1.5 text-cyan-600 dark:text-cyan-400">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Inspected Project</span>
                </span>
                <span className="font-mono text-[9px] bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  NPM
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-xs truncate font-mono">
                {analysisResult?.project_name || 'No Project Loaded'}
              </div>
              {analysisResult ? (
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-200/80 dark:border-white/[0.06]">
                  <span className="font-mono text-slate-700 dark:text-slate-300">v{analysisResult.project_version}</span>
                  <span className="text-cyan-700 dark:text-cyan-400 font-mono font-semibold bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-200 dark:border-cyan-800/40">
                    {displayStats?.total_packages || 0} pkgs
                  </span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  Upload manifest to start analysis.
                </p>
              )}
            </div>

            {sidebarCollapsed && (
              <div className="hidden lg:flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 dark:bg-[#111726] border border-slate-200 dark:border-white/[0.06] text-center" title={analysisResult?.project_name || 'No Project Loaded'}>
                <GitCommit className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mb-1" />
                <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300 truncate max-w-[50px]">
                  {analysisResult?.project_name ? analysisResult.project_name.slice(0, 5) + '..' : 'Empty'}
                </span>
              </div>
            )}

            {/* Navigation Sections with Animated Active Pill Indicator */}
            <nav className="space-y-4">
              {navSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  <div className={`text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 pb-1 ${
                    sidebarCollapsed ? 'block lg:hidden' : 'block'
                  }`}>
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.to || (item.to === '/overview' && location.pathname === '/');
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={`relative group flex items-center ${
                          sidebarCollapsed ? 'justify-between lg:justify-center px-3 py-2.5 lg:p-2.5' : 'justify-between px-3 py-2.5'
                        } rounded-xl text-xs font-medium transition-colors duration-150 ${
                          isActive
                            ? 'text-cyan-800 dark:text-cyan-300 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Animated Active Pill Indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="activeNavTab"
                            className="absolute inset-0 bg-gradient-to-r from-cyan-500/15 to-teal-500/5 dark:from-cyan-500/20 dark:to-teal-500/10 rounded-xl border border-cyan-500/30 dark:border-cyan-500/40 shadow-2xs"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}

                        <div className="relative z-10 flex items-center space-x-3">
                          <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'
                          }`} />
                          <span className={sidebarCollapsed ? 'inline lg:hidden' : 'inline'}>{item.label}</span>
                        </div>

                        {item.badge && (
                          <span className={`relative z-10 text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold border ${item.badgeColor} ${
                            sidebarCollapsed ? 'inline lg:hidden' : 'inline'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* Sidebar Footer Metadata */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.06] space-y-2 text-[11px] text-slate-500">
            {isSimulatedActive && (
              <div className={`flex items-center ${
                sidebarCollapsed ? 'space-x-2 p-2.5 lg:justify-center lg:p-2' : 'space-x-2 p-2.5'
              } text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-200 dark:border-indigo-500/30 shadow-2xs animate-pulse`}>
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div className={`text-[11px] leading-tight ${sidebarCollapsed ? 'block lg:hidden' : 'block'}`}>
                  <div>Simulation Active</div>
                  <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-normal">Graph reflects in-memory diff</span>
                </div>
              </div>
            )}

            {/* Graph Notation Card in Drawer */}
            <div className={`bg-slate-50 dark:bg-[#101625] p-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] space-y-1 ${
              sidebarCollapsed ? 'block lg:hidden' : 'block'
            }`}>
              <span className="text-slate-500 dark:text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">Graph Notation</span>
              <span className="font-mono text-cyan-700 dark:text-cyan-400 text-[11px] font-medium">A &rarr; B (A depends on B)</span>
            </div>

            <div className={`bg-slate-50 dark:bg-[#101625] p-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] space-y-1 ${
              sidebarCollapsed ? 'block lg:hidden' : 'block'
            }`}>
              <span className="text-slate-500 dark:text-slate-400 block font-semibold text-[10px] uppercase tracking-wider">Algorithm Spec</span>
              <span className="font-mono text-cyan-700 dark:text-cyan-400 text-[11px]">Tarjan SCC &bull; Kahn Topo &bull; BFS Blast</span>
            </div>
          </div>
        </aside>

        {/* Central Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-[#080c16] p-4 sm:p-6 lg:p-8 space-y-6 transition-colors duration-200">
          {/* Global Error Banner */}
          {errorMessage && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 p-4 rounded-2xl flex items-start space-x-3 shadow-lg backdrop-blur-sm"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm">System Alert / Request Failed</div>
                <div className="text-xs text-rose-600 dark:text-rose-300/90 mt-0.5">{errorMessage}</div>
              </div>
            </motion.div>
          )}

          {/* Active Route Content with Smooth Transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: easeSoft }}
              className="space-y-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global Application Developer Status Ribbon Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/[0.06] bg-white dark:bg-[#0b0f1a] py-2.5 px-6 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 transition-colors duration-200">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-medium text-slate-700 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Software Dependency Impact Analyzer</span>
          </div>
          <span>&bull;</span>
          <span className="font-mono text-[11px] text-slate-500">Engine v{backendHealth?.version || '0.1.0'}</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
          <span>{displayStats ? `${displayStats.total_packages} Nodes in Graph` : '0 Nodes'}</span>
          <span>&bull;</span>
          <span>FastAPI + Cytoscape + React 18</span>
        </div>
      </footer>
    </div>
  );
}
