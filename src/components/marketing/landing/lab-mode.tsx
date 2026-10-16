"use client";

import { Ban, CircleAlert, Clock, LayoutGrid } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Section, SectionHead } from "./section";

const points = [
  {
    Icon: Ban,
    title: "Blocks AI sites during the session",
    body: "A list you control, active only while the exam runs.",
  },
  {
    Icon: LayoutGrid,
    title: "Live view of every seat",
    body: "See who is signed in and which seat needs a look.",
  },
  {
    Icon: Clock,
    title: "Switches off when the exam ends",
    body: "No monitoring outside the announced session.",
  },
];

const OFF_SEATS = new Set([7, 22]);
const ALERT_SEAT = 14;

/** A 30-seat lab grid; seat 14 turns amber with an alert ~2s after it scrolls in. */
export function LabMode() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const [alerted, setAlerted] = useState(false);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = window.setTimeout(() => setAlerted(true), 2200);
    return () => window.clearTimeout(timer);
  }, [inView, reduce]);
  const alert = alerted || !!reduce;

  return (
    <Section id="lab" labelledBy="lab-title">
      <div className="wrap lab">
        <div className="rv">
          <SectionHead
            align="left"
            style={{ marginBottom: 0 }}
            eyebrow="Live Lab Mode"
            titleId="lab-title"
            title={
              <>
                Lab exams, <em>without the guesswork.</em>
              </>
            }
            lead="For practical exams on college PCs. Turn it on for the session, and every seat shows up on one calm screen."
          />
          <ul className="lab-points">
            {points.map(({ Icon, title, body }) => (
              <li key={title}>
                <span className="lab-ic">
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <b>{title}</b>
                  <span>{body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div
          ref={ref}
          className="card seats-panel rv"
          role="img"
          aria-label="Live grid of 30 lab seats. Seat 14 tried to open ChatGPT and the site was blocked."
        >
          <div className="sp-head">
            <div className="sp-title">
              <b>CS-102 Programming Lab · Practical</b>
              <span>Lab 3 · 28 of 30 signed in</span>
            </div>
            <span className="live-chip">
              <span className="live-dot" aria-hidden="true" />
              Live
            </span>
            <span className="sp-timer">01:12:40 left</span>
          </div>
          <div className="seats">
            {Array.from({ length: 30 }, (_, i) => {
              const n = i + 1;
              const off = OFF_SEATS.has(n);
              const flagged = n === ALERT_SEAT && alert;
              return (
                <div
                  key={n}
                  className={`seat${off ? " is-off" : ""}${flagged ? " is-alert" : ""}`}
                >
                  <span className="seat-n">{String(n).padStart(2, "0")}</span>
                  <span className="seat-s">
                    <i />
                    <em style={{ fontStyle: "normal" }}>
                      {off ? "Not signed in" : flagged ? "Needs a look" : "Working"}
                    </em>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "var(--good)" }} />
              Working
            </span>
            <span>
              <i style={{ background: "var(--insight)" }} />
              Needs a look
            </span>
            <span>
              <i style={{ background: "var(--border-strong)" }} />
              Not signed in
            </span>
          </div>
          {alert ? (
            <div className="alert">
              <span className="alert-ic">
                <CircleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div>
                <b>Seat 14 tried to open ChatGPT</b>
                <span>
                  Blocked automatically · 10:42 AM. Nothing else needed unless you want to
                  check in.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
