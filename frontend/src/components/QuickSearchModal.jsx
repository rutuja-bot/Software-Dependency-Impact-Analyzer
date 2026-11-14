import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Package,
  LayoutDashboard,
  FileJson,
  ShieldAlert,
  Clock,
  Sparkles,
  Database,
  Activity,
  X,
  ArrowRight,
  Command
} from 'lucide-react';
import { useAnalysis } from '../context/AnalysisContext';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function QuickSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { displayNodes, setSelectedNode } = useAnalysis();
  const shouldReduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global window-level Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Quick navigation destinations (all 7 application views)
  const navItems = [
    { label: 'Overview Dashboard', path: '/overview', icon: LayoutDashboard, category: 'Pages' },
    { label: 'Analyze Manifest', path: '/analyze', icon: FileJson, category: 'Pages' },
    { label: 'Security Analysis', path: '/security', icon: ShieldAlert, category: 'Pages' },
    { label: 'Freshness / LibYear', path: '/freshness', icon: Clock, category: 'Pages' },
    { label: 'What-If Simulation', path: '/simulation', icon: Sparkles, category: 'Pages' },
    { label: 'Project History', path: '/history', icon: Database, category: 'Pages' },
    { label: 'Package Inspector', path: '/inspector', icon: Activity, category: 'Pages' },
  ];

  // Matching packages from active graph
  const matchedPackages = (displayNodes || [])
    .filter(n => n.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
    .map(n => ({
      label: n.name,
      version: n.version ? `v${n.version}` : 'vUnknown',
      depType: n.dep_type || 'pkg',
      isPackage: true,
      category: 'Packages in Active Graph'
    }));

  const matchedNav = navItems.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...matchedNav,
    ...matchedPackages
  ];

  // Automatic scrolling for arrow key traversal
  useEffect(() => {
    if (listRef.current && allItems.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, allItems.length]);

  const handleSelect = (item) => {
    if (item.isPackage) {
      setSelectedNode(item.label);
      navigate('/inspector');
    } else if (item.path) {
      navigate(item.path);
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === 'Enter' && allItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(allItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:px-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
          aria-hidden="true"
        />

        {/* Modal Window */}
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Package and View Search"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.22, ease: easeSoft }}
          className="relative w-full max-w-xl bg-white dark:bg-[#0f1422] border border-slate-200/90 dark:border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden z-10"
        >
          {/* Search Header */}
          <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-white/[0.08]">
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="quicksearch-results-list"
              aria-activedescendant={allItems[selectedIndex] ? `search-item-${selectedIndex}` : undefined}
              aria-autocomplete="list"
              aria-label="Search packages or navigate views"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search packages in graph, navigate views, or jump to tools..."
              className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search dialog"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            id="quicksearch-results-list"
            role="listbox"
            aria-label="Search Results"
            className="max-h-80 overflow-y-auto p-2 space-y-1"
          >
            {allItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No matching packages or navigation routes found for "{query}".
              </div>
            ) : (
              allItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = item.icon || Package;
                return (
                  <div
                    key={`${item.label}-${idx}`}
                    id={`search-item-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition text-sm font-medium ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-500/15 to-teal-500/10 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div className={`p-1.5 rounded-lg ${
                        item.isPackage
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={item.isPackage ? 'font-mono' : ''}>{item.label}</span>
                      {item.version && (
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                          {item.version}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-xs text-slate-400 dark:text-slate-500 shrink-0 font-mono">
                      <span>{item.isPackage ? 'Inspect' : 'Jump'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-[#070b14] border-t border-slate-200 dark:border-white/[0.06] text-xs sm:text-[13px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center space-x-3">
              <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">↑↓</kbd> Navigate</span>
              <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">Enter</kbd> Select</span>
              <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">Esc</kbd> Close</span>
            </div>
            <div className="flex items-center space-x-1 font-mono text-xs">
              <Command className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>K Command Palette</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
