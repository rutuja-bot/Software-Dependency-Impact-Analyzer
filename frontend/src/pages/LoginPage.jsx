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
  ShieldCheck,
  Info,
  Server,
  Sparkles,
  Zap
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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#080c16] dark:text-slate-100 flex flex-col justify-between font-sans selection:bg-cyan-500/30 selection:text-cyan-900 dark:selection:text-cyan-200 transition-colors duration-200">

      {/* Top Navbar */}
      <header className="border-b border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-[#0c111e]/90 backdrop-blur-md sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative p-2.5 bg-gradient-to-br from-cyan-500/20 to-teal-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl border border-cyan-500/30 shadow-glow-sm">
              <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Software Dependency Impact Analyzer
              </h1>
            </div>
          </div>

          {/* System Status Indicators & Theme Toggle */}
          <div className="flex items-center space-x-3 text-xs">
            {backendHealth?.status === 'healthy' ? (
              <div className="flex items-center space-x-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-xs">API Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>Backend Offline</span>
              </div>
            )}
            {dbStatus?.connected && (
              <div className="hidden sm:flex items-center space-x-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/25 px-3 py-1.5 rounded-full font-medium shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span className="font-mono text-xs">PostgreSQL Active</span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Center Stage */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative">
        {/* Ambient Grid Backdrop */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none"></div>

        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: easeSoft }}
          className="w-full max-w-md space-y-6 relative z-10"
        >
          {/* Card Container */}
          <div className="relative overflow-hidden bg-white/95 dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-sm dark:shadow-card backdrop-blur space-y-6 transition-colors duration-200">

            {/* Branding Header inside Card */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-gradient-to-br from-cyan-500/20 to-teal-500/10 text-cyan-600 dark:text-cyan-400 rounded-2xl border border-cyan-500/30 shadow-glow-sm">
                <Network className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {mode === 'login' ? 'Sign In to Workspace' : 'Create Local Session'}
              </h2>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                Explore dependency trees, blast radius graphs, OSV advisories, and LibYear metrics
              </p>
            </div>

            {/* Mode Switch Tabs with Animated Pill */}
            <div className="flex bg-slate-100 dark:bg-[#070b14] p-1.5 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
              {['login', 'signup'].map((tabMode) => {
                const isSelected = mode === tabMode;
                return (
                  <button
                    key={tabMode}
                    type="button"
                    onClick={() => { setMode(tabMode); setFormError(null); setFormSuccess(null); }}
                    className={`relative flex-1 text-sm font-bold py-2.5 rounded-xl transition duration-150 ${
                      isSelected
                        ? 'text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeAuthTab"
                        className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-teal-600 rounded-xl shadow-glow-sm"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{tabMode === 'login' ? 'Sign In' : 'Register'}</span>
                  </button>
                );
              })}
            </div>

            {/* Error & Success Alerts */}
            <AnimatePresence>
              {formError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: easeSoft }}
                  className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 p-3.5 rounded-xl flex items-start space-x-2.5 text-sm overflow-hidden"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
                  <span>{formError}</span>
                </motion.div>
              )}
              {formSuccess && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: easeSoft }}
                  className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3.5 rounded-xl flex items-start space-x-2.5 text-sm overflow-hidden"
                >
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                  <span>{formSuccess}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Display Name (Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Lead Analyst"
                    className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@domain.com"
                  className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition"
                  autoComplete="current-password"
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Confirm Password</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {/* Submit Button */}
              <motion.button
                type="submit"
                whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-glow-sm transition text-base duration-200"
              >
                <span>{mode === 'login' ? 'Sign In to Workspace' : 'Initialize Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </form>

            {/* Quick Demo Access */}
            <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <motion.button
                type="button"
                onClick={handleDemoSignIn}
                whileHover={shouldReduceMotion ? {} : { scale: 1.015 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 dark:bg-[#070b14] dark:hover:bg-slate-800/60 border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white py-2.5 px-4 rounded-xl text-sm font-semibold transition duration-150"
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Launch as Demo Analyst</span>
                </div>
                <span className="text-xs text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-500/20 font-mono">
                  1-Click Access
                </span>
              </motion.button>
            </div>

            {/* Architecture Transparency Notice */}
            <div className="bg-slate-50 dark:bg-[#070b14] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 space-y-1">
              <div className="flex items-center space-x-1.5 text-slate-800 dark:text-slate-300 font-bold">
                <Info className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Client Session Architecture</span>
              </div>
              <p className="leading-relaxed">
                Backend services provide graph algorithms, OSV security, and PostgreSQL persistence. Sessions are authenticated in browser storage for demonstration convenience.
              </p>
            </div>

          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/[0.06] bg-white dark:bg-[#0b0f1a] py-4.5 text-center text-xs sm:text-[13px] text-slate-500 transition-colors duration-200">
        Software Dependency Impact Analyzer &bull; B.Tech Computer Science Project &bull; Directed Graph & DSA Architecture
      </footer>
    </div>
  );
}
