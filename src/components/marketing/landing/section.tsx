"use client";

import { useInView } from "motion/react";
import { useRef } from "react";

/**
 * A landing section that marks itself `data-in` the first time it scrolls
 * into view. Children with `rv` fade up (and their `rc` cards stagger) via
 * site.css; under reduced motion they render in their final state.
 */
export function Section({
  id,
  labelledBy,
  label,
  children,
}: {
  id: string;
  labelledBy?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.06, margin: "0px 0px -10% 0px" });
  return (
    <section
      ref={ref}
      id={id}
      className="sec"
      aria-labelledby={labelledBy}
      aria-label={label}
      data-in={inView ? "" : undefined}
    >
      {children}
    </section>
  );
}

/** Section eyebrow + serif title (+ optional lead), revealed with the section. */
export function SectionHead({
  eyebrow,
  title,
  titleId,
  lead,
  align = "center",
  className = "",
  style,
}: {
  eyebrow: string;
  title: React.ReactNode;
  titleId: string;
  lead?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`sec-head${align === "left" ? " sec-head--left" : ""} ${className}`.trim()}
      style={style}
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="h-section" id={titleId}>
        {title}
      </h2>
      {lead ? <p className="sec-lead">{lead}</p> : null}
    </div>
  );
}
