import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Premium Motion curves inspired by high-end developer tools:
 * - easeSoft: [0.22, 1, 0.36, 1] (smooth deceleration with gentle settling)
 * - easeFast: [0.25, 0.1, 0.25, 1] (snappy feedback for micro-interactions)
 * - Full respect for prefers-reduced-motion
 */

export const easeSoft = [0.22, 1, 0.36, 1];
export const easeFast = [0.25, 0.1, 0.25, 1];

export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: easeSoft }
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.16, ease: 'easeIn' }
  }
};

export const reducedPageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } }
};

export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02
    }
  }
};

export const cardVariants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: easeSoft }
  }
};

export const listItemVariants = {
  initial: { opacity: 0, x: -6 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: easeSoft }
  }
};

export const subtleScale = {
  whileHover: { scale: 1.015, transition: { duration: 0.15, ease: easeSoft } },
  whileTap: { scale: 0.985, transition: { duration: 0.08 } }
};

export const buttonMotion = {
  whileHover: { scale: 1.02, transition: { duration: 0.12, ease: easeSoft } },
  whileTap: { scale: 0.97, transition: { duration: 0.08 } }
};

/**
 * AnimatedCounter component:
 * Smoothly interpolates numeric values from start to target using cubic ease.
 * Instantly renders target value if user has enabled prefers-reduced-motion.
 */
export function AnimatedCounter({
  value = 0,
  duration = 0.55,
  decimals = 0,
  suffix = '',
  className = ''
}) {
  const shouldReduceMotion = useReducedMotion();
  const numericTarget = typeof value === 'number' ? value : parseFloat(value) || 0;
  const [displayValue, setDisplayValue] = useState(shouldReduceMotion ? numericTarget : 0);
  const prevTargetRef = useRef(shouldReduceMotion ? numericTarget : 0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(numericTarget);
      prevTargetRef.current = numericTarget;
      return;
    }

    const startValue = prevTargetRef.current;
    const diff = numericTarget - startValue;
    if (diff === 0 && displayValue === numericTarget) return;

    const startTime = performance.now();
    const durationMs = duration * 1000;

    const updateFrame = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = startValue + diff * easeProgress;

      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(updateFrame);
      } else {
        setDisplayValue(numericTarget);
        prevTargetRef.current = numericTarget;
      }
    };

    frameRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [numericTarget, duration, shouldReduceMotion]);

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.round(displayValue);

  return (
    <span className={className}>
      {formatted}{suffix}
    </span>
  );
}

/**
 * Skeleton component:
 * Shimmer loader that mimics real content shape during async network fetches.
 */
export function Skeleton({ className = '', height = '1rem', width = '100%', rounded = 'rounded-xl' }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-200/70 dark:bg-slate-800/60 ${rounded} ${className}`}
      style={{ height, width }}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent" />
    </div>
  );
}
