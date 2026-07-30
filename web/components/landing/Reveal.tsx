"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Fades a section in as it scrolls into view.
 *
 * `once` so content never animates away again while reading, and a no-op when
 * the visitor prefers reduced motion.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  onMount = false,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  /**
   * Animate as soon as the component mounts instead of waiting for it to
   * scroll into view. Required above the fold: `whileInView` leaves content at
   * `initial` (invisible) if the visitor scrolls past it before it registers.
   */
  onMount?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  const target = { opacity: 1, y: 0 };
  const transition = { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const };

  if (onMount) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0, y }}
        animate={target}
        transition={transition}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={target}
      // `amount: 0.05` fires as soon as a sliver is visible, so fast scrolling
      // never strands a section at zero opacity.
      viewport={{ once: true, amount: 0.05 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
