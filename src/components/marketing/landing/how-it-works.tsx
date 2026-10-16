"use client";

import { BookOpen } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useRef, useState } from "react";
import { Section, SectionHead } from "./section";

/**
 * Three steps joined by a line that draws itself as the list scrolls up the
 * viewport (horizontal on desktop, vertical on phones). Each step lights up
 * when the line reaches it.
 */
export function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.82", "start 0.32"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setP(Math.round(v * 100) / 100));
  const shown = reduce ? 1 : p;
  const fill = reduce ? 1 : scrollYProgress;

  const stepClass = (on: boolean) => (on ? "step is-on" : "step");

  return (
    <Section id="how" labelledBy="how-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="How it works"
          titleId="how-title"
          title={
            <>
              Three steps from your syllabus <em>to a clear picture.</em>
            </>
          }
        />
        <ol className="steps" ref={ref} style={{ margin: 0, padding: 0, listStyle: "none" }}>
          <li aria-hidden="true" className="steps-track" />
          <motion.li aria-hidden="true" className="steps-fill" style={{ scaleX: fill }} />
          <li aria-hidden="true" className="steps-vtrack" />
          <motion.li aria-hidden="true" className="steps-vfill" style={{ scaleY: fill }} />

          <li className={stepClass(shown > 0.02)}>
            <span className="step-num">01</span>
            <div className="step-body">
              <h3>Teachers set the rules</h3>
              <p>Choose Learn, Assist or Exam mode for each assignment. Sage follows it.</p>
              <div className="card step-ui" aria-hidden="true">
                <div className="modes">
                  <span className="mode is-sel">
                    Learn<small>Hints only</small>
                  </span>
                  <span className="mode">
                    Assist<small>Explains more</small>
                  </span>
                  <span className="mode">
                    Exam<small>Sage off</small>
                  </span>
                </div>
                <div className="ui-row">
                  <span>Assignment 3 · Entropy</span>
                  <span className="mono">Due Fri</span>
                </div>
              </div>
            </div>
          </li>

          <li className={stepClass(shown >= 0.5)}>
            <span className="step-num">02</span>
            <div className="step-body">
              <h3>Students learn with Sage</h3>
              <p>Hints, questions and explanations grounded in your course notes.</p>
              <div className="card step-ui" aria-hidden="true">
                <div className="mini-bubble">
                  Which formula links heat, temperature and entropy?
                </div>
                <div className="ui-row">
                  <span className="ui-chip">
                    <BookOpen size={12} strokeWidth={1.5} />
                    Notes, p.12
                  </span>
                  <span className="mono">Hint 2 of 5</span>
                </div>
              </div>
            </div>
          </li>

          <li className={stepClass(shown >= 0.98)}>
            <span className="step-num">03</span>
            <div className="step-body">
              <h3>Teachers see the picture</h3>
              <p>A dashboard, a Reliance Score, and Lens to ask anything about your class.</p>
              <div className="card step-ui" aria-hidden="true">
                <div className="ui-row">
                  <span>Reliance Score · class average</span>
                </div>
                <div className="score">
                  <b>34</b>
                  <span>down 12 since week 2</span>
                </div>
                <div className="meter">
                  <i style={{ width: "34%" }} />
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </Section>
  );
}
