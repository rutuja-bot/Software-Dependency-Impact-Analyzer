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
  Server
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, signup, backendHealth, dbStatus } = useAnalysis();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
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

    // Validation
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
      }, 500);
    } else {
      login(cleanEmail, password);
      setFormSuccess('Signed in successfully. Redirecting to workspace...');
      setTimeout(() => {
        navigate('/overview');
      }, 500);
    }
  };

  const handleDemoSignIn = () => {
    login('analyst@depanalyzer.local', 'Demo1234');
    navigate('/overview');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg border border-teal-500/20">
              <Network className="w-6 h-6 text-teal-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Software Dependency Impact Analyzer</h1>
              <p className="text-xs text-slate-400">Graph-Based Change Impact & What-If Simulation Engine</p>
            </div>
          </div>

          {/* System Status Indicators */}
          <div className="flex items-center space-x-3 text-xs">
            {backendHealth?.status === 'healthy' ? (
              <div className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>API Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Backend Offline</span>
              </div>
            )}
            {dbStatus?.connected && (
              <div className="hidden sm:flex items-center space-x-1.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                <span>PostgreSQL Active</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Form Center Stage */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Card Container */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur space-y-6">
            
            {/* Branding Header inside Card */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
                <Network className="w-8 h-8 text-teal-400" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {mode === 'login' ? 'Sign In to Workspace' : 'Create Local Session'}
              </h2>
              <p className="text-xs text-slate-400">
                Access dependency trees, blast-radius graphs, and vulnerability scans
              </p>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                onClick={() => { setMode('login'); setFormError(null); setFormSuccess(null); }}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${
                  mode === 'login' 
                    ? 'bg-slate-800 text-teal-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setFormError(null); setFormSuccess(null); }}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${
                  mode === 'signup' 
                    ? 'bg-slate-800 text-teal-400 border border-slate-700 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Register
              </button>
            </div>

            {/* Error & Success Alerts */}
            {formError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl flex items-center space-x-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl flex items-center space-x-2.5 text-xs">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300 flex items-center space-x-1">
                    <User className="w-3.5 h-3.5 text-teal-400" />
                    <span>Display Name (Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-teal-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@domain.com"
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-teal-400" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                  autoComplete="current-password"
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300 flex items-center space-x-1">
                    <Lock className="w-3.5 h-3.5 text-teal-400" />
                    <span>Confirm Password</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                    autoComplete="new-password"
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition text-xs"
              >
                <span>{mode === 'login' ? 'Sign In to Workspace' : 'Initialize Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Demo Access */}
            <div className="pt-2 border-t border-slate-700/60">
              <button
                type="button"
                onClick={handleDemoSignIn}
                className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white py-2 px-3 rounded-lg text-xs font-medium transition"
              >
                <span>Continue as Demo Analyst</span>
                <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20 font-mono">Quick Access</span>
              </button>
            </div>

            {/* Architecture Transparency Notice */}
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
                <Info className="w-3.5 h-3.5 text-teal-400" />
                <span>Client-Session Architecture Note</span>
              </div>
              <p>
                The backend engine provides graph algorithms, OSV security, and PostgreSQL persistence without server-side user authentication endpoints. User sessions are managed locally in client storage to facilitate prototype navigation; this does not provide secure backend authentication.
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 text-center text-xs text-slate-500">
        Software Dependency Impact Analyzer &bull; B.Tech Computer Science Project &bull; Directed Graph & DSA Architecture
      </footer>
    </div>
  );
}
