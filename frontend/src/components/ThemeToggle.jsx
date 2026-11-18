import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { easeSoft } from '../utils/animations';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, isDark } = useTheme();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.94 }}
      transition={{ duration: 0.15, ease: easeSoft }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative inline-flex items-center justify-center p-2.5 rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19B6A4]/60 ${
        isDark
          ? 'bg-[#111C2E] hover:bg-[#172438] text-amber-400 border-[#26364D] hover:border-[#19B6A4]/40 shadow-xs'
          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 shadow-xs'
      } ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="dark-sun"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.8 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            className="flex items-center justify-center"
          >
            <Sun className="w-4 h-4 text-amber-300" />
          </motion.div>
        ) : (
          <motion.div
            key="light-moon"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.8 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            className="flex items-center justify-center"
          >
            <Moon className="w-4 h-4 text-indigo-600" />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">
        {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      </span>
    </motion.button>
  );
}
