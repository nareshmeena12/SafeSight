"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up from 0 the first time it scrolls into view (cubic
 * ease-out, like the prototype). Shows the final value under reduced motion.
 */
export function CountUp({
  value,
  duration = 1.4,
  delay = 0.25,
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration, delay]);

  const display = reduce ? value : shown;
  return (
    <span ref={ref} className={className}>
      {Math.round(display).toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
