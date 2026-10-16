"use client";

import {
  ArrowUp,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Monitor,
  RotateCcwClock,
  Search,
  Users,
} from "lucide-react";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { CountUp } from "./count-up";
import { Section, SectionHead } from "./section";

// Class average Reliance Score by week: [label, value, y in the 560×206 chart].
const weeks = [
  ["W2", 46, 52],
  ["W3", 45, 60],
  ["W4", 43, 76],
  ["W5", 41, 92],
  ["W6", 40, 100],
  ["W7", 37, 124],
  ["W8", 36, 132],
  ["W9", 34, 148],
] as const;
const points = weeks.map(([wk, v, y], i) => ({ wk, v, y, x: 44 + i * 70 }));
const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
const areaPath = `M44,180 L${points.map((p) => `${p.x},${p.y}`).join(" L")} L534,180 Z`;

const topics = [
  { name: "Entropy and the second law", n: 41, hot: true },
  { name: "Rankine cycle efficiency", n: 28 },
  { name: "Steady-flow energy equation", n: 19 },
  { name: "Ideal gas mixtures", n: 11 },
];

const people = [
  { initials: "AM", name: "Arjun Mehta", note: "Rising for 3 weeks", score: 71 },
  { initials: "KK", name: "Kabir Khan", note: "Mostly Assist mode", score: 64 },
  { initials: "RS", name: "Riya Sharma", note: "New this week", score: 58 },
];

const side = [
  { label: "Overview", Icon: LayoutDashboard, on: true },
  { label: "Students", Icon: Users },
  { label: "Assignments", Icon: FileText },
  { label: "Lens", Icon: Search },
  { label: "Trace", Icon: RotateCcwClock },
  { label: "Lab Mode", Icon: Monitor },
];

const callouts = [
  {
    title: "Reliance Score",
    body: "How much of the work leans on AI, from 0 to 100. Lower means more independent thinking.",
  },
  {
    title: "Where they're stuck",
    body: "Built from the hints students ask Sage for, so you can plan the next lecture.",
  },
  {
    title: "Ask Lens",
    body: "Plain-English questions, answered with charts and the names behind them.",
  },
];

/**
 * A static picture of the teacher overview. It starts tilted back 16° and
 * flattens as it scrolls in; then the three callouts pop in. On phones the
 * tilt is off and the callouts become numbered pins with a list below.
 */
export function DashboardPreview() {
  const frame = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frame, offset: ["start end", "start 0.3"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const [calloutsIn, setCalloutsIn] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v >= 0.92) setCalloutsIn(true);
  });
  const inView = useInView(frame, { once: true, amount: 0.2 });
  const [hover, setHover] = useState<number | null>(null);
  const hp = hover === null ? null : points[hover];

  const kpi = (value: number) => (inView || reduce ? <CountUp value={value} delay={0.35} /> : 0);

  return (
    <Section id="teachers" labelledBy="dash-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="For teachers"
          titleId="dash-title"
          title={
            <>
              Know your class <em>in 10 seconds.</em>
            </>
          }
          lead="One page shows who is learning, where the class is stuck and how AI is being used, without reading a single chat log."
        />
        <div className="dash-stage">
          <div className="glow" aria-hidden="true" />
          <motion.div
            className="dash"
            ref={frame}
            style={reduce ? undefined : { rotateX, scale, transformPerspective: 2200 }}
            role="img"
            aria-label="SafeSight teacher dashboard for ME-204 Thermodynamics, week 9"
          >
            <aside className="dash-side" aria-hidden="true">
              <span className="logo">
                <LogoMark className="size-5" />
                <span>SafeSight</span>
              </span>
              <div className="course-pick">
                ME-204 Thermodynamics<small>Monsoon 2026 · 112 students</small>
              </div>
              {side.map(({ label, Icon, on }) => (
                <span key={label} className={on ? "side-item is-on" : "side-item"}>
                  <Icon size={16} strokeWidth={1.5} />
                  {label}
                </span>
              ))}
            </aside>

            <div className="dash-main">
              <div className="dash-top">
                <div>
                  <h3>Good morning, Dr. Kulkarni</h3>
                  <p className="dash-sub">ME-204 Thermodynamics · Week 9</p>
                </div>
                <span className="chip-sel">
                  This week
                  <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </div>

              <div className="kpis">
                <div className="card kpi">
                  <div className="kpi-label">Active students</div>
                  <div className="kpi-val">{kpi(112)}</div>
                  <div className="kpi-delta">of 118 enrolled</div>
                </div>
                <div className="card kpi">
                  <div className="kpi-label">AI conversations this week</div>
                  <div className="kpi-val">{kpi(1284)}</div>
                  <div className="kpi-delta">
                    <b>+6%</b> vs last week
                  </div>
                </div>
                <div className="card kpi">
                  <span className="pin">1</span>
                  <div className="kpi-label">Average Reliance Score</div>
                  <div className="kpi-val">{kpi(34)}</div>
                  <div className="kpi-delta">
                    <b>−2</b> vs last week
                  </div>
                </div>
                <div className="card kpi">
                  <div className="kpi-label">Open flags</div>
                  <div className="kpi-val">{kpi(6)}</div>
                  <div className="kpi-delta">2 new since Monday</div>
                </div>
              </div>

              <div className="dash-row">
                <div className="card panel">
                  <p className="panel-h">
                    Reliance Score, class average<small>lower means more independent work</small>
                  </p>
                  <div className="chart" onMouseLeave={() => setHover(null)}>
                    <svg viewBox="0 0 560 206">
                      <g className="grid">
                        <line x1="36" x2="552" y1="20" y2="20" />
                        <line x1="36" x2="552" y1="100" y2="100" />
                        <line x1="36" x2="552" y1="180" y2="180" />
                      </g>
                      <text className="ax" x="0" y="24">
                        50
                      </text>
                      <text className="ax" x="0" y="104">
                        40
                      </text>
                      <text className="ax" x="0" y="184">
                        30
                      </text>
                      <path className="area" d={areaPath} />
                      <polyline className="line" points={linePoints} />
                      {hp ? <line className="xh" x1={hp.x} x2={hp.x} y1="16" y2="180" /> : null}
                      {points.map((pt, i) => (
                        <g key={pt.wk}>
                          <text className="ax" x={pt.x} y="202" textAnchor="middle">
                            {pt.wk}
                          </text>
                          <circle
                            className="pt"
                            cx={pt.x}
                            cy={pt.y}
                            r={i === points.length - 1 || i === hover ? 5 : 3.5}
                          />
                          <rect
                            className="hit"
                            x={pt.x - 35}
                            y="0"
                            width="70"
                            height="190"
                            onMouseEnter={() => setHover(i)}
                          />
                        </g>
                      ))}
                      <text className="lbl" x="534" y="136" textAnchor="middle">
                        34
                      </text>
                    </svg>
                    {hp ? (
                      <div
                        className="tip"
                        style={{
                          left: `${((hp.x / 560) * 100).toFixed(2)}%`,
                          top: `${((hp.y / 206) * 100).toFixed(2)}%`,
                        }}
                      >
                        Week {hp.wk.slice(1)} · <b>{hp.v}</b>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="card panel">
                  <span className="pin">2</span>
                  <p className="panel-h">
                    Topics the class is stuck on<small>hint requests</small>
                  </p>
                  <ul className="topics">
                    {topics.map((t) => (
                      <li key={t.name} className={t.hot ? "topic is-hot" : "topic"}>
                        <div className="topic-top">
                          <span>{t.name}</span>
                          <b>{t.n}</b>
                        </div>
                        <div className="meter">
                          <i
                            className={t.hot ? "hot" : undefined}
                            style={{ width: `${Math.round((t.n / topics[0].n) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="dash-row">
                <div className="card panel lens-box">
                  <span className="pin">3</span>
                  <p className="panel-h">
                    Lens<small>your class assistant</small>
                  </p>
                  <div className="lens-input">
                    <Search size={18} strokeWidth={1.5} aria-hidden="true" />
                    <span>Ask anything about your class</span>
                    <span className="send">
                      <ArrowUp size={16} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="lens-sugs">
                    <span className="lens-sug">Who is over-relying on AI this week?</span>
                    <span className="lens-sug">Which question took longest?</span>
                    <span className="lens-sug">Compare section A and B</span>
                  </div>
                </div>
                <div className="card panel panel--people">
                  <p className="panel-h">
                    Worth a check-in<small>Reliance Score</small>
                  </p>
                  <ul className="people">
                    {people.map((p) => (
                      <li key={p.name} className="person">
                        <span className="initials">{p.initials}</span>
                        <span>
                          {p.name}
                          <small>{p.note}</small>
                        </span>
                        <b>{p.score}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="callouts">
            {callouts.map((c, i) => (
              <div
                key={c.title}
                className={`callout callout--${i + 1}${calloutsIn || reduce ? " is-in" : ""}`}
              >
                <span className="cnum">{i + 1}</span>
                <div>
                  <b>{c.title}</b>
                  <span>{c.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
