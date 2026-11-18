import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  Lock,
  Mail,
  User,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  ShieldAlert,
  Clock,
  GitBranch,
  Layers,
  Database,
  Cpu,
  Info,
  Server,
  Zap,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import ThemeToggle from '../components/ThemeToggle';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function LoginPage() {
  const shouldReduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { login, signup, backendHealth, dbStatus } = useAnalysis();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFormError('Email address is required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setFormError('Please enter a valid email address (e.g. analyst@example.com).');
      return;
    }

    if (!password) {
      setFormError('Password is required.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters in length.');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setFormError('Passwords do not match. Please re-enter.');
        return;
      }
      signup(cleanEmail, password, displayName.trim());
      setFormSuccess('Account initialized. Redirecting to workspace...');
      setTimeout(() => {
        navigate('/overview');
      }, 400);
    } else {
      login(cleanEmail, password);
      setFormSuccess('Signed in successfully. Redirecting to workspace...');
      setTimeout(() => {
        navigate('/overview');
      }, 400);
    }
  };

  const handleDemoSignIn = () => {
    login('analyst@depanalyzer.local', 'Demo1234');
    navigate('/overview');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B1220] dark:text-[#F1F5F9] flex flex-col justify-between font-sans selection:bg-[#19B6A4]/30 selection:text-[#19B6A4] transition-colors duration-200">

      {/* Top Navbar */}
      <header className="border-b border-slate-200/90 dark:border-[#26364D] bg-white/95 dark:bg-[#111C2E]/95 backdrop-blur-md sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-2 sm:p-2.5 bg-[#19B6A4]/10 text-[#19B6A4] rounded-xl border border-[#19B6A4]/30 shadow-glow-teal">
              <Network className="w-4 h-4 sm:w-5 sm:h-5 text-[#19B6A4]" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                <span className="sm:hidden">Dependency Analyzer</span>
                <span className="hidden sm:inline">Software Dependency Impact Analyzer</span>
              </h1>
            </div>
          </div>

          {/* System Status Indicators & Theme Toggle */}
          <div className="flex items-center space-x-3 text-xs">
            {backendHealth?.status === 'healthy' ? (
              <div className="flex items-center space-x-2 bg-emerald-50 dark:bg-[#22C55E]/10 text-emerald-700 dark:text-[#22C55E] border border-emerald-200 dark:border-[#22C55E]/30 px-3 py-1.5 rounded-full font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
                </span>
                <span className="font-mono text-xs">API v{backendHealth.version || '0.1.0'}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-rose-50 dark:bg-[#F05252]/10 text-rose-700 dark:text-[#F05252] border border-rose-200 dark:border-[#F05252]/30 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-[#F05252]"></span>
                <span>Backend Offline</span>
              </div>
            )}
            {dbStatus?.connected && (
              <div className="hidden sm:flex items-center space-x-2 bg-slate-100 dark:bg-[#4C8DCE]/10 text-slate-700 dark:text-[#4C8DCE] border border-slate-300 dark:border-[#4C8DCE]/30 px-3 py-1.5 rounded-full font-medium">
                <Database className="w-3.5 h-3.5 text-[#4C8DCE]" />
                <span className="font-mono text-xs">Neon PostgreSQL</span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Hero & Landing Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center w-full">

          {/* Left Hero: Architecture, Risk Intelligence & Graph Illustration */}
          <div className="lg:col-span-7 space-y-6">

            {/* Enterprise Tag */}
            <div className="inline-flex items-center space-x-2 bg-[#19B6A4]/10 border border-[#19B6A4]/25 px-3 py-1.5 rounded-full text-xs font-semibold text-[#19B6A4]">
              <Activity className="w-3.5 h-3.5" />
              <span>Enterprise Software Architecture & Risk Intelligence</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-[#F1F5F9] leading-tight">
                Inspect Dependency Graphs. Measure Blast Radius. Detect Vulnerabilities.
              </h2>
              <p className="text-base sm:text-lg text-slate-600 dark:text-[#94A3B8] leading-relaxed max-w-2xl">
                A directed-graph analysis platform engineered for full-stack JavaScript & Node.js software projects.
                Simulate upgrades, map reverse blast radiuses, evaluate LibYear technical lag, and audit OSV advisories.
              </p>
            </div>

            {/* Sophisticated Dependency Graph Illustration */}
            <div className="relative bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-2xl p-4 sm:p-5 shadow-card overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#26364D] text-xs font-mono text-[#94A3B8]">
                <div className="flex items-center space-x-2">
                  <GitBranch className="w-4 h-4 text-[#19B6A4]" />
                  <span className="font-semibold text-slate-800 dark:text-[#F1F5F9] text-xs sm:text-sm">Directed Graph & Blast Radius Model</span>
                </div>
                <span className="hidden sm:inline text-[#19B6A4] font-medium">Topological Traversal</span>
              </div>

              {/* Interactive SVG Diagram */}
              <div className="relative h-48 sm:h-60 w-full mt-3 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 540 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Edges with directional flow */}
                  <path d="M 90 110 L 210 50" stroke="#475569" strokeWidth="2" strokeDasharray="3 3" />
                  <path d="M 90 110 L 210 110" stroke="#4C8DCE" strokeWidth="2.5" />
                  <path d="M 90 110 L 210 170" stroke="#475569" strokeWidth="2" strokeDasharray="3 3" />

                  <path d="M 230 50 L 370 40" stroke="#475569" strokeWidth="2" />
                  <path d="M 230 110 L 370 90" stroke="#4C8DCE" strokeWidth="2" />
                  <path d="M 230 110 L 370 140" stroke="#F05252" strokeWidth="2.5" strokeDasharray="4 2" />
                  <path d="M 230 170 L 370 180" stroke="#475569" strokeWidth="2" />

                  <path d="M 390 140 L 480 140" stroke="#F05252" strokeWidth="2.5" />

                  {/* Project Root Node (Technical Teal) */}
                  <g transform="translate(80, 110)">
                    <circle r="22" fill="#172438" stroke="#19B6A4" strokeWidth="3" />
                    <circle r="8" fill="#19B6A4" />
                    <text y="36" textAnchor="middle" fill="#19B6A4" fontSize="11" fontWeight="700" fontFamily="monospace">project-root</text>
                    <text y="48" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">v1.0.0</text>
                  </g>

                  {/* Direct Dependency 1 (Steel Blue) */}
                  <g transform="translate(220, 50)">
                    <circle r="18" fill="#172438" stroke="#4C8DCE" strokeWidth="2.5" />
                    <circle r="6" fill="#4C8DCE" />
                    <text y="30" textAnchor="middle" fill="#F1F5F9" fontSize="10" fontWeight="600" fontFamily="monospace">express</text>
                    <text y="41" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">^4.19.2</text>
                  </g>

                  {/* Direct Dependency 2 (Steel Blue) */}
                  <g transform="translate(220, 110)">
                    <circle r="18" fill="#172438" stroke="#4C8DCE" strokeWidth="2.5" />
                    <circle r="6" fill="#4C8DCE" />
                    <text y="30" textAnchor="middle" fill="#F1F5F9" fontSize="10" fontWeight="600" fontFamily="monospace">axios</text>
                    <text y="41" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">^1.6.8</text>
                  </g>

                  {/* Direct Dependency 3 (Steel Blue) */}
                  <g transform="translate(220, 170)">
                    <circle r="18" fill="#172438" stroke="#4C8DCE" strokeWidth="2.5" />
                    <circle r="6" fill="#4C8DCE" />
                    <text y="30" textAnchor="middle" fill="#F1F5F9" fontSize="10" fontWeight="600" fontFamily="monospace">cors</text>
                    <text y="41" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">^2.8.5</text>
                  </g>

                  {/* Transitive Node 1 (Cyan/Blue) */}
                  <g transform="translate(380, 40)">
                    <circle r="15" fill="#172438" stroke="#38BDF8" strokeWidth="2" />
                    <circle r="5" fill="#38BDF8" />
                    <text y="26" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">body-parser</text>
                  </g>

                  {/* Transitive Node 2 (Cyan/Blue) */}
                  <g transform="translate(380, 90)">
                    <circle r="15" fill="#172438" stroke="#38BDF8" strokeWidth="2" />
                    <circle r="5" fill="#38BDF8" />
                    <text y="26" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">follow-redirects</text>
                  </g>

                  {/* Vulnerable Node (Critical Red) */}
                  <g transform="translate(380, 140)">
                    <circle r="17" fill="#172438" stroke="#F05252" strokeWidth="3" />
                    <circle r="6" fill="#F05252" />
                    <circle r="22" stroke="#F05252" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.8" />
                    <text y="28" textAnchor="middle" fill="#F05252" fontSize="10" fontWeight="700" fontFamily="monospace">semver</text>
                    <text y="39" textAnchor="middle" fill="#F05252" fontSize="8" fontFamily="monospace">⚠️ CVE-2022-25883</text>
                  </g>

                  {/* Transitive Node 3 (Cyan/Blue) */}
                  <g transform="translate(380, 190)">
                    <circle r="15" fill="#172438" stroke="#38BDF8" strokeWidth="2" />
                    <circle r="5" fill="#38BDF8" />
                    <text y="26" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">object-assign</text>
                  </g>

                  {/* Downstream Affected Node (Simulation / Blast Radius) */}
                  <g transform="translate(480, 140)">
                    <circle r="14" fill="#172438" stroke="#F59E0B" strokeWidth="2" />
                    <circle r="4" fill="#F59E0B" />
                    <text y="24" textAnchor="middle" fill="#F59E0B" fontSize="9" fontFamily="monospace">lru-cache</text>
                  </g>
                </svg>
              </div>

              {/* Architecture Pillars Footer */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-slate-200 dark:border-[#26364D] text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#19B6A4]"></span>
                  <span className="text-slate-700 dark:text-[#F1F5F9] font-medium">Root Consumer</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4C8DCE]"></span>
                  <span className="text-slate-700 dark:text-[#F1F5F9] font-medium">Direct Deps</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F05252]"></span>
                  <span className="text-[#F05252] font-medium">Vulnerable CVE Node</span>
                </div>
              </div>
            </div>

            {/* Key Capabilities Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] rounded-xl p-3.5 space-y-1">
                <div className="flex items-center space-x-2 text-[#19B6A4] font-semibold text-xs uppercase tracking-wider">
                  <Network className="w-3.5 h-3.5" />
                  <span>Directed Graph Engine</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                  Adjacency list traversal with cycle detection & BFS reverse impact tracing.
                </p>
              </div>
              <div className="bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] rounded-xl p-3.5 space-y-1">
                <div className="flex items-center space-x-2 text-[#4C8DCE] font-semibold text-xs uppercase tracking-wider">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>OSV Advisory Intelligence</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                  Automated package vulnerability scans against Google OSV database.
                </p>
              </div>
              <div className="bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] rounded-xl p-3.5 space-y-1">
                <div className="flex items-center space-x-2 text-emerald-600 dark:text-[#22C55E] font-semibold text-xs uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  <span>LibYear Freshness</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
                  Quantify technical lag across npm registries using 365.25-day cadence formula.
                </p>
              </div>
            </div>

          </div>

          {/* Right Form: Authentication / Workspace Access */}
          <div className="lg:col-span-5">
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: easeSoft }}
              className="w-full"
            >
              <div className="bg-white dark:bg-[#172438] border border-slate-200 dark:border-[#26364D] rounded-2xl p-6 sm:p-8 shadow-card space-y-6 transition-colors duration-200">

                {/* Form Header */}
                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">
                    {mode === 'login' ? 'Sign In to Workspace' : 'Initialize Workspace Session'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8]">
                    Enter credentials or launch the pre-configured demonstration workspace.
                  </p>
                </div>

                {/* Mode Switch Tabs */}
                <div className="flex bg-slate-100 dark:bg-[#111C2E] p-1 rounded-xl border border-slate-200 dark:border-[#26364D]">
                  {['login', 'signup'].map((tabMode) => {
                    const isSelected = mode === tabMode;
                    return (
                      <button
                        key={tabMode}
                        type="button"
                        onClick={() => { setMode(tabMode); setFormError(null); setFormSuccess(null); }}
                        className={`relative flex-1 text-sm font-semibold py-2 rounded-lg transition duration-150 ${
                          isSelected
                            ? 'text-white'
                            : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F1F5F9]'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="activeAuthTab"
                            className="absolute inset-0 bg-[#19B6A4] rounded-lg shadow-glow-teal"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{tabMode === 'login' ? 'Sign In' : 'Register'}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Alerts */}
                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: easeSoft }}
                      className="bg-rose-50 dark:bg-[#F05252]/10 border border-rose-200 dark:border-[#F05252]/30 text-rose-700 dark:text-[#F05252] p-3 rounded-xl flex items-start space-x-2 text-xs sm:text-sm overflow-hidden"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </motion.div>
                  )}
                  {formSuccess && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: easeSoft }}
                      className="bg-emerald-50 dark:bg-[#22C55E]/10 border border-emerald-200 dark:border-[#22C55E]/30 text-emerald-700 dark:text-[#22C55E] p-3 rounded-xl flex items-start space-x-2 text-xs sm:text-sm overflow-hidden"
                    >
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formSuccess}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Form Inputs */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'signup' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-[#94A3B8] flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-[#19B6A4]" />
                        <span>Display Name</span>
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Lead Security Analyst"
                        className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4] transition"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-[#94A3B8] flex items-center space-x-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#19B6A4]" />
                      <span>Email Address</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="analyst@domain.com"
                      className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4] transition"
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-[#94A3B8] flex items-center space-x-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#19B6A4]" />
                      <span>Password</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4] transition"
                      autoComplete="current-password"
                    />
                  </div>

                  {mode === 'signup' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-[#94A3B8] flex items-center space-x-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#19B6A4]" />
                        <span>Confirm Password</span>
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 dark:bg-[#111C2E] border border-slate-300 dark:border-[#26364D] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none focus:border-[#19B6A4] transition"
                        autoComplete="new-password"
                      />
                    </div>
                  )}

                  {/* Primary Submit Button */}
                  <motion.button
                    type="submit"
                    whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                    whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
                    className="w-full flex items-center justify-center space-x-2 bg-[#19B6A4] hover:bg-[#149989] text-white font-semibold py-3 px-4 rounded-xl shadow-glow-teal transition text-sm duration-150"
                  >
                    <span>{mode === 'login' ? 'Sign In to Workspace' : 'Initialize Workspace'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </form>

                {/* Quick 1-Click Demo Access */}
                <div className="pt-4 border-t border-slate-200 dark:border-[#26364D]">
                  <motion.button
                    type="button"
                    onClick={handleDemoSignIn}
                    whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                    whileTap={shouldReduceMotion ? {} : { scale: 0.99 }}
                    className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 dark:bg-[#111C2E] dark:hover:bg-[#1C2C44] border border-slate-200 dark:border-[#26364D] text-slate-800 dark:text-[#F1F5F9] py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-medium transition"
                  >
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-[#4C8DCE]" />
                      <span>Launch Demo Analyst Session</span>
                    </div>
                    <span className="text-xs text-[#4C8DCE] bg-[#4C8DCE]/10 px-2.5 py-0.5 rounded-full border border-[#4C8DCE]/25 font-mono">
                      1-Click
                    </span>
                  </motion.button>
                </div>

                {/* Session Architecture Info */}
                <div className="bg-slate-50 dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-xl p-3.5 text-xs text-slate-600 dark:text-[#94A3B8] space-y-1">
                  <div className="flex items-center space-x-1.5 text-slate-800 dark:text-[#F1F5F9] font-semibold">
                    <Info className="w-3.5 h-3.5 text-[#19B6A4]" />
                    <span>Client & Backend Session</span>
                  </div>
                  <p className="leading-relaxed">
                    Directed graph traversal, vulnerability scanning, and PostgreSQL synchronization are handled by FastAPI backend microservices.
                  </p>
                </div>

              </div>
            </motion.div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-[#26364D] bg-white dark:bg-[#111C2E] py-4 text-center text-xs text-[#94A3B8] transition-colors duration-200">
        Software Dependency Impact Analyzer &bull; Directed Graph & Cybersecurity Architecture &bull; Technical Teal & Steel Blue Identity
      </footer>
    </div>
  );
}
