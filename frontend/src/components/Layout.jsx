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
      title: 'Analysis & Architecture',
      items: [
        {
          to: '/overview',
          label: 'Overview',
          icon: LayoutDashboard,
          badge: displayStats?.total_packages ? `${displayStats.total_packages} pkgs` : null,
          badgeColor: 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
        },
        {
          to: '/analyze',
          label: 'Project Analyzer',
          icon: FileJson,
          badge: null
        },
        {
          to: '/explorer',
          label: 'Dependency Explorer',
          icon: Activity,
          badge: null
        }
      ]
    },
    {
      title: 'Governance & Simulation',
      items: [
        {
          to: '/risk',
          label: 'Risk Analysis',
          icon: ShieldAlert,
          badge: securityResult?.vulnerable_packages_count > 0
            ? `${securityResult.vulnerable_packages_count} vulns`
            : (securityResult ? 'Clean' : null),
          badgeColor: securityResult?.vulnerable_packages_count > 0
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        },
        {
          to: '/simulation',
          label: 'What-If Simulation',
          icon: Sparkles,
          badge: isSimulatedActive ? 'Simulated' : null,
          badgeColor: 'bg-[#4C8DCE]/10 text-[#4C8DCE] border-[#4C8DCE]/30'
        },
        {
          to: '/history',
          label: 'Project History',
          icon: Database,
          badge: dbStatus?.total_analyses ? `${dbStatus.total_analyses} runs` : null,
          badgeColor: 'bg-slate-200/60 dark:bg-[#172438] text-slate-600 dark:text-[#94A3B8] border-slate-300 dark:border-[#26364D]'
        }
      ]
    }
  ];

  // Helper for current route title
  const currentPath = location.pathname;
  let pageTitle = 'Dashboard';
  if (currentPath.includes('analyze')) pageTitle = 'Project Analyzer & Ingestion';
  else if (currentPath.includes('explorer') || currentPath.includes('inspector')) pageTitle = 'Dependency Explorer';
  else if (currentPath.includes('risk') || currentPath.includes('security') || currentPath.includes('freshness')) pageTitle = 'Risk Analysis & Governance';
  else if (currentPath.includes('simulation')) pageTitle = 'What-If Simulation';
  else if (currentPath.includes('history')) pageTitle = 'Project History';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-[#0B1220] dark:text-[#F1F5F9] flex flex-col font-sans selection:bg-[#19B6A4]/30 selection:text-[#19B6A4] transition-colors duration-200">

      {/* Quick Command / Search Modal */}
      <QuickSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />

      {/* Top Navigation Header */}
      <header className="border-b border-slate-200/90 dark:border-[#26364D] bg-white/95 dark:bg-[#111C2E]/95 backdrop-blur-md sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          {/* Logo & Project Title */}
          <div className="flex items-center space-x-3.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-[#172438] transition"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <motion.div
              onClick={() => navigate('/overview')}
              whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
              className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer group shrink-0"
            >
              <div className="relative p-2 sm:p-2.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/30 shadow-glow-teal group-hover:border-[#19B6A4]/50 transition duration-300">
                <Network className="w-4 h-4 sm:w-5 sm:h-5 text-[#19B6A4]" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#19B6A4] animate-ping opacity-75"></span>
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#19B6A4]"></span>
              </div>
              <div>
                <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight group-hover:text-[#19B6A4] transition duration-200">
                  <span className="sm:hidden">Dependency Analyzer</span>
                  <span className="hidden sm:inline">Software Dependency Impact Analyzer</span>
                </h1>
              </div>
            </motion.div>
          </div>

          {/* Quick Search Trigger Bar (Desktop) */}
          <div className="hidden md:flex flex-1 max-w-md mx-2">
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="w-full flex items-center justify-between bg-slate-100/80 hover:bg-slate-200/70 dark:bg-[#0B1220] dark:hover:bg-[#172438] border border-slate-200 dark:border-[#26364D] hover:border-[#19B6A4]/40 text-slate-500 dark:text-[#94A3B8] px-3.5 py-1.5 rounded-xl text-sm transition duration-150 group shadow-2xs"
            >
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-slate-400 group-hover:text-[#19B6A4] transition" />
                <span className="truncate">Quick search packages & views...</span>
              </div>
              <div className="flex items-center space-x-1 font-mono text-xs bg-white dark:bg-[#111C2E] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
                <span>Ctrl K</span>
              </div>
            </button>
          </div>

          {/* Right Header Statuses & User Session */}
          <div className="flex items-center space-x-2 sm:space-x-3 text-sm shrink-0">
            {/* Mobile Quick Search Button */}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-[#172438] border border-transparent dark:border-[#26364D] transition"
              aria-label="Open search"
            >
              <Search className="w-4 h-4" />
            </button>
            {/* Backend Health Status Badge */}
            {backendHealth?.status === 'healthy' ? (
              <div className="hidden sm:flex items-center space-x-2 bg-[#22C55E]/10 text-emerald-700 dark:text-[#22C55E] border border-emerald-500/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
                </span>
                <span className="font-mono text-xs">API v{backendHealth.version || '0.1.0'}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-[#F05252]/10 text-rose-600 dark:text-[#F05252] border border-[#F05252]/30 px-3 py-1.5 rounded-full font-medium">
                <XCircle className="w-4 h-4" />
                <span>Backend Disconnected</span>
              </div>
            )}

            {/* Database Status Badge */}
            {dbStatus?.connected ? (
              <div className="hidden md:flex items-center space-x-2 bg-[#4C8DCE]/10 text-[#4C8DCE] border border-[#4C8DCE]/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <Database className="w-4 h-4 text-[#4C8DCE]" />
                <span className="font-mono text-xs">{dbStatus.total_projects || 0} Projects Persisted</span>
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-100 text-slate-600 border border-slate-300 dark:bg-[#172438] dark:text-[#94A3B8] dark:border-[#26364D] px-3 py-1.5 rounded-full font-medium">
                <Cpu className="w-4 h-4" />
                <span>In-Memory Mode</span>
              </div>
            )}

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* User Session & Sign Out */}
            {currentUser && (
              <div className="flex items-center space-x-2.5 pl-2 border-l border-slate-200 dark:border-[#26364D]">
                <div className="hidden lg:flex flex-col text-right">
                  <span className="text-sm font-semibold text-slate-800 dark:text-[#F1F5F9]">{currentUser.name || currentUser.email}</span>
                  <span className="text-xs text-[#19B6A4] font-mono font-medium">{currentUser.role || 'Analyst'}</span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#19B6A4] to-[#4C8DCE] flex items-center justify-center text-white font-bold text-xs shadow-xs ring-1 ring-white/10">
                  {(currentUser.name || currentUser.email || 'A').charAt(0).toUpperCase()}
                </div>
                <motion.button
                  type="button"
                  onClick={handleLogout}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
                  title="Sign out of analyst workspace"
                  className="flex items-center space-x-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 border border-slate-300/80 hover:border-rose-300 dark:bg-[#172438] dark:hover:bg-[#F05252]/20 dark:hover:text-[#F05252] dark:text-slate-300 dark:border-[#26364D] dark:hover:border-[#F05252]/40 px-2.5 py-1.5 rounded-xl transition text-sm shadow-2xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </motion.button>
              </div>
            )}
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
              className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs lg:hidden"
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
          ${mobileMenuOpen ? 'fixed top-14 sm:top-16 bottom-0 left-0 z-40 w-72 bg-white dark:bg-[#111C2E] shadow-2xl' : 'hidden lg:flex'}
          ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
          bg-white dark:bg-[#111C2E] border-r border-slate-200/90 dark:border-[#26364D] flex flex-col justify-between shrink-0 p-3.5 space-y-6 overflow-y-auto transition-all duration-200
        `}>
          <div className="space-y-5">

            {/* Sidebar Collapse Toggle (Desktop Only) */}
            <div className="hidden lg:flex items-center justify-between pb-1 border-b border-slate-200/80 dark:border-[#26364D]">
              {!sidebarCollapsed && (
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-[#94A3B8]">
                  Navigation
                </span>
              )}
              <button
                type="button"
                onClick={toggleSidebar}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#172438] transition ml-auto"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {/* Active Project Card */}
            <div className={`relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-[#172438] dark:to-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-2xl p-3.5 space-y-2 shadow-card ${
              sidebarCollapsed ? 'block lg:hidden' : 'block'
            }`}>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] font-bold">
                <span className="flex items-center space-x-1.5 text-[#19B6A4]">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Inspected Project</span>
                </span>
                <span className="font-mono text-xs bg-white dark:bg-[#111C2E] text-slate-600 dark:text-[#94A3B8] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#26364D]">
                  NPM
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-[#F1F5F9] text-sm truncate font-mono">
                {analysisResult?.project_name || 'No Project Loaded'}
              </div>
              {analysisResult ? (
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#94A3B8] pt-1.5 border-t border-slate-200/80 dark:border-[#26364D]">
                  <span className="font-mono text-slate-700 dark:text-[#F1F5F9]">v{analysisResult.project_version}</span>
                  <span className="text-[#19B6A4] font-mono font-semibold bg-[#19B6A4]/10 px-2 py-0.5 rounded border border-[#19B6A4]/30">
                    {displayStats?.total_packages || 0} pkgs
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-[#64748B] italic">
                  Upload manifest to start analysis.
                </p>
              )}
            </div>

            {sidebarCollapsed && (
              <div className="hidden lg:flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] text-center" title={analysisResult?.project_name || 'No Project Loaded'}>
                <GitCommit className="w-4 h-4 text-[#19B6A4] mb-1" />
                <span className="text-[10px] font-mono text-slate-600 dark:text-[#94A3B8] truncate max-w-[50px]">
                  {analysisResult?.project_name ? analysisResult.project_name.slice(0, 5) + '..' : 'Empty'}
                </span>
              </div>
            )}

            {/* Navigation Sections with Animated Active Pill Indicator */}
            <nav className="space-y-4">
              {navSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-1">
                  <div className={`text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#64748B] px-3 pb-1 ${
                    sidebarCollapsed ? 'block lg:hidden' : 'block'
                  }`}>
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.to ||
                      (item.to === '/overview' && location.pathname === '/') ||
                      (item.to === '/explorer' && location.pathname === '/inspector') ||
                      (item.to === '/risk' && (location.pathname === '/security' || location.pathname === '/freshness'));
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={`relative group flex items-center ${
                          sidebarCollapsed ? 'justify-between lg:justify-center px-3 py-2.5 lg:p-2.5' : 'justify-between px-3 py-2.5'
                        } rounded-xl text-sm font-medium transition-colors duration-150 ${
                          isActive
                            ? 'text-teal-800 dark:text-[#19B6A4] font-semibold'
                            : 'text-slate-600 hover:text-slate-900 dark:text-[#94A3B8] dark:hover:text-[#F1F5F9] hover:bg-slate-100/70 dark:hover:bg-[#172438]/60'
                        }`}
                      >
                        {/* Animated Active Pill Indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="activeNavTab"
                            className="absolute inset-0 bg-[#19B6A4]/10 dark:bg-[#19B6A4]/15 rounded-xl border border-[#19B6A4]/30 dark:border-[#19B6A4]/40 shadow-2xs"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}

                        <div className="relative z-10 flex items-center space-x-3">
                          <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            isActive ? 'text-[#19B6A4]' : 'text-slate-400 dark:text-[#64748B]'
                          }`} />
                          <span className={sidebarCollapsed ? 'inline lg:hidden' : 'inline'}>{item.label}</span>
                        </div>

                        {item.badge && (
                          <span className={`relative z-10 text-xs font-mono px-2 py-0.5 rounded-md font-semibold border ${item.badgeColor} ${
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
          {isSimulatedActive && (
            <div className="pt-3 border-t border-slate-200/80 dark:border-[#26364D] text-xs">
              <div className={`flex items-center ${
                sidebarCollapsed ? 'space-x-2 p-2.5 lg:justify-center lg:p-2' : 'space-x-2 p-2.5'
              } text-[#4C8DCE] font-semibold bg-[#4C8DCE]/10 rounded-xl border border-[#4C8DCE]/25 shadow-2xs animate-pulse`}>
                <Sparkles className="w-4 h-4 text-[#4C8DCE] shrink-0" />
                <div className={`text-xs leading-tight ${sidebarCollapsed ? 'block lg:hidden' : 'block'}`}>
                  <div>Simulation Active</div>
                  <span className="text-[11px] text-[#4C8DCE]/80 font-normal">Graph reflects in-memory diff</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Central Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-[#0B1220] p-4 sm:p-6 lg:p-8 space-y-6 transition-colors duration-200">
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

      {/* Global Application Footer */}
      <footer className="border-t border-slate-200/80 dark:border-[#26364D] bg-white dark:bg-[#111C2E] py-3 px-6 text-sm text-slate-500 dark:text-[#94A3B8] flex flex-wrap items-center justify-between gap-2 transition-colors duration-200">
        <div className="flex items-center space-x-2.5 font-medium text-slate-700 dark:text-[#F1F5F9]">
          <span className="w-2 h-2 rounded-full bg-[#19B6A4]"></span>
          <span>Software Dependency Impact Analyzer</span>
          <span className="text-slate-400 dark:text-[#64748B]">&bull;</span>
          <span className="font-mono text-xs text-slate-500 dark:text-[#94A3B8]">v{backendHealth?.version || '0.1.0'}</span>
        </div>
        <div className="text-xs font-mono text-slate-500 dark:text-[#94A3B8]">
          {displayStats ? `${displayStats.total_packages} Packages in Active Graph` : 'No Active Graph'}
        </div>
      </footer>
    </div>
  );
}
