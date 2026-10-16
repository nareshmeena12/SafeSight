"use client";

import { Check, Clipboard, FileText, Pause, Play, RotateCcwClock } from "lucide-react";
import {
  animate,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Section, SectionHead } from "./section";

// Replay clock: 520 ticks = 52 active minutes (10 ticks a minute).
const END = 520;
const PASTE_AT = 320;
const RATE = 50; // ticks per second while playing
const PASTE_HOLD = 0.88; // seconds the replay lingers on the paste

const TEXT_A =
  "Aim: To find the thermal efficiency of a simple Rankine cycle and see how boiler pressure affects it. Readings were taken at three boiler pressures in the thermal engineering lab.";
const PASTED =
  "The Rankine cycle is the idealised thermodynamic cycle of a steam power plant. It consists of four processes: isentropic compression in the pump, constant-pressure heat addition in the boiler, isentropic expansion in the turbine and constant-pressure heat rejection in the condenser. Raising the boiler pressure increases the mean temperature of heat addition, which raises the thermal efficiency of the cycle, although it also increases the moisture content at the turbine exit.";
const TEXT_C =
  "Conclusion: Efficiency rose from 27.4% to 31.2% as boiler pressure went from 20 to 40 bar, which matches the trend in our notes.";

const pad = (n: number) => String(n).padStart(2, "0");

const bars = Array.from({ length: 52 }, (_, i) => {
  const gap = i === 17 || i === 39;
  return { i, gap, paste: i === 32, h: i === 32 ? 100 : gap ? 0 : 18 + ((i * 37) % 47) };
});

function replayAt(t: number) {
  const m = t / 10;
  const [session, start, off] =
    m < 18
      ? ["Session 1 · Monday", 20 * 60 + 10, m]
      : m < 40
        ? ["Session 2 · Tuesday", 14 * 60 + 18, m - 18]
        : ["Session 3 · Wednesday", 21 * 60 + 2, m - 40];
  const mins = Math.floor((start as number) + (off as number));
  const clock = `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  const words =
    m <= 18
      ? (86 * m) / 18
      : m < 32
        ? 86 + (34 * (m - 18)) / 14
        : m < 40
          ? 620 + (8 * (m - 32)) / 8
          : 628 + (12 * (m - 40)) / 12;
  const fa = Math.min(1, m / 32);
  const fc = Math.max(0, Math.min(1, (m - 40) / 12));
  const el = Math.floor(m);
  const es = Math.floor((m - el) * 60);
  return {
    m,
    session: session as string,
    clock,
    words: Math.round(words),
    elapsed: `${pad(el)}:${pad(es)}`,
    textA: TEXT_A.slice(0, Math.round(TEXT_A.length * fa)),
    textC: TEXT_C.slice(0, Math.round(TEXT_C.length * fc)),
  };
}

/**
 * Trace replay of an invented lab report: typing, one large paste at 14:32,
 * more typing. Auto-plays once when it scrolls into view; the scrubber (a
 * range input) can be dragged or moved with the arrow keys.
 */
export function TraceReplay() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const tt = useMotionValue(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  useMotionValueEvent(tt, "change", (v) => setT(Math.round(v)));

  const pause = () => {
    controls.current?.stop();
    controls.current = null;
    setPlaying(false);
  };

  const play = (fromStart: boolean) => {
    controls.current?.stop();
    const start = fromStart || tt.get() >= END ? 0 : tt.get();
    tt.set(start);
    setPlaying(true);
    const done = () => setPlaying(false);
    if (start < PASTE_AT) {
      const run = (PASTE_AT - start) / RATE;
      const rest = (END - PASTE_AT) / RATE;
      const total = run + PASTE_HOLD + rest;
      controls.current = animate(tt, [start, PASTE_AT, PASTE_AT, END], {
        duration: total,
        times: [0, run / total, (run + PASTE_HOLD) / total, 1],
        ease: "linear",
        onComplete: done,
      });
    } else {
      controls.current = animate(tt, END, {
        duration: (END - start) / RATE,
        ease: "linear",
        onComplete: done,
      });
    }
  };
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  useEffect(() => {
    if (reduce) {
      tt.set(END);
      return;
    }
    if (!inView) return;
    const timer = window.setTimeout(() => playRef.current(true), 700);
    return () => window.clearTimeout(timer);
  }, [inView, reduce, tt]);

  useEffect(() => () => controls.current?.stop(), []);

  const r = replayAt(t);
  const pct = ((t / END) * 100).toFixed(2);

  return (
    <Section id="trace" labelledBy="trace-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="Trace"
          titleId="trace-title"
          title={
            <>
              See how work was made, <em>not just what was submitted.</em>
            </>
          }
        />
        <div className="trace rv">
          <div className="card replay rc" style={{ transitionDelay: "80ms" }} ref={ref}>
            <div className="replay-head">
              <span className="initials" aria-hidden="true">
                SI
              </span>
              <div className="replay-who">
                <b>Sneha Iyer</b>
                <span>ME-204 · Lab report 4: Rankine cycle</span>
              </div>
              <span className="replay-badge">
                <RotateCcwClock size={14} strokeWidth={1.5} aria-hidden="true" />
                Replay
              </span>
            </div>
            <div className="doc">
              <h4>Lab report 4: Efficiency of a simple Rankine cycle</h4>
              <p>
                {r.textA}
                {playing && r.m < 32 ? <span className="caret" aria-hidden="true" /> : null}
              </p>
              {r.m >= 32 ? <p className="pasted">{PASTED}</p> : null}
              <p>
                {r.textC}
                {playing && r.m >= 40 && r.m < 52 ? (
                  <span className="caret" aria-hidden="true" />
                ) : null}
              </p>
            </div>
            <div className="tl">
              <div className="tl-top">
                <button
                  type="button"
                  className="play"
                  aria-label={playing ? "Pause replay" : "Play replay"}
                  onClick={() => (playing ? pause() : play(false))}
                >
                  {playing ? (
                    <Pause size={16} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Play size={16} strokeWidth={1.5} aria-hidden="true" />
                  )}
                </button>
                <div className="tl-time">
                  <b>{r.clock}</b>
                  <span>{r.session}</span>
                </div>
                <div className="tl-time tl-words">
                  <b>{r.words} words</b>
                  <span>{r.elapsed} / 52:00 active</span>
                </div>
              </div>
              <div className="track">
                <span className="paste-flag" style={{ left: "62.5%" }}>
                  <Clipboard size={11} strokeWidth={2} aria-hidden="true" />
                  Paste · 14:32
                </span>
                <div className="bars-tl" aria-hidden="true">
                  {bars.map((b) => (
                    <span
                      key={b.i}
                      className={b.paste ? "paste" : b.gap ? "gap" : b.i < r.m ? "past" : undefined}
                      style={{ height: `${b.h}%` }}
                    />
                  ))}
                </div>
                <div className="sess" aria-hidden="true">
                  <span style={{ width: "34.6%" }}>Mon · 18 min</span>
                  <span style={{ width: "42.3%" }}>Tue · 22 min</span>
                  <span style={{ width: "23.1%" }}>Wed · 12 min</span>
                </div>
                <input
                  className="scrub"
                  type="range"
                  min={0}
                  max={END}
                  step={1}
                  value={t}
                  onChange={(e) => {
                    pause();
                    tt.set(Number(e.target.value));
                  }}
                  aria-label="Replay position"
                  aria-valuetext={`${r.session}, ${r.clock}`}
                />
                <span className="playhead" style={{ left: `${pct}%` }} aria-hidden="true" />
              </div>
            </div>
          </div>

          <aside className="card evidence rc" style={{ transitionDelay: "200ms" }} aria-label="Evidence summary">
            <div className="ev-top">
              <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
              Evidence summary
            </div>
            <p className="ev-quote">
              Written over 3 sessions, 52 minutes active.{" "}
              <mark>One paste at 14:32 made up 78% of the final text.</mark>
            </p>
            <div className="ev-grid">
              <div>
                <small>Sessions</small>
                <b>3</b>
              </div>
              <div>
                <small>Active time</small>
                <b>52 min</b>
              </div>
              <div>
                <small>Typed</small>
                <b>22%</b>
              </div>
              <div>
                <small>Pasted</small>
                <b>78%</b>
              </div>
            </div>
            <p className="ev-note">
              <Check size={18} strokeWidth={1.5} aria-hidden="true" />
              Trace reports evidence. Teachers decide.
            </p>
          </aside>
        </div>
      </div>
    </Section>
  );
}
