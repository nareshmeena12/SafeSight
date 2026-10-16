import { ChartLine, Check, MessageCircle, RotateCcwClock, Search } from "lucide-react";
import { Section, SectionHead } from "./section";

const lensRows = [
  { name: "Arjun Mehta", score: 71 },
  { name: "Kabir Khan", score: 64 },
  { name: "Riya Sharma", score: 58 },
];

// Mini Trace timeline: typing bursts (k), quiet gaps, one paste (p).
const timeline: { h: number; kind?: "k" | "p" }[] = [
  { h: 40, kind: "k" },
  { h: 62, kind: "k" },
  { h: 35, kind: "k" },
  { h: 55, kind: "k" },
  { h: 30, kind: "k" },
  { h: 12 },
  { h: 48, kind: "k" },
  { h: 58, kind: "k" },
  { h: 100, kind: "p" },
  { h: 26, kind: "k" },
  { h: 12 },
  { h: 44, kind: "k" },
  { h: 36, kind: "k" },
  { h: 22, kind: "k" },
];

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="ticks">
      {items.map((item) => (
        <li key={item}>
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Agents() {
  return (
    <Section id="product" labelledBy="agents-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="The product"
          titleId="agents-title"
          title={
            <>
              Three agents. <em>One goal: real learning.</em>
            </>
          }
        />
        <div className="agents rv">
          <article className="card agent lift rc" style={{ transitionDelay: "60ms" }}>
            <div className="agent-art" aria-hidden="true">
              <div className="glow" />
              <div
                className="art-card"
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "78%",
                  background: "var(--bubble)",
                  borderColor: "transparent",
                  fontSize: 13,
                  color: "var(--text)",
                }}
              >
                Can you just write the answer for Q3?
              </div>
              <div
                className="art-card"
                style={{
                  maxWidth: "88%",
                  background: "var(--primary-soft)",
                  borderColor: "transparent",
                  fontSize: 13,
                  color: "var(--text)",
                }}
              >
                Let&apos;s crack it together. What happens to entropy at constant temperature?
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="ui-chip">Learn mode</span>
                <span className="hint">Hint 1 of 5</span>
              </div>
            </div>
            <div className="agent-body">
              <h3 className="agent-name">
                <span className="avatar" aria-hidden="true">
                  <MessageCircle size={16} strokeWidth={1.5} />
                </span>
                Sage<span className="agent-for">for students</span>
              </h3>
              <p className="agent-role">
                An AI tutor that coaches students through problems and never hands over the
                final answer to graded work.
              </p>
              <Ticks
                items={[
                  "Hints and questions that build understanding",
                  "Explains using your notes, with page citations",
                ]}
              />
            </div>
          </article>

          <article className="card agent lift rc" style={{ transitionDelay: "160ms" }}>
            <div className="agent-art" aria-hidden="true">
              <div className="glow" />
              <div className="art-card art-q">
                <Search size={14} strokeWidth={1.5} />
                Who is over-relying on AI this week?
              </div>
              <div className="art-card art-rows">
                {lensRows.map((row) => (
                  <div key={row.name} className="art-row">
                    <span>{row.name}</span>
                    <div className="meter">
                      <i style={{ width: `${row.score}%` }} />
                    </div>
                    <b>{row.score}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="agent-body">
              <h3 className="agent-name">
                <span className="avatar" aria-hidden="true">
                  <ChartLine size={16} strokeWidth={1.5} />
                </span>
                Lens<span className="agent-for">for teachers</span>
              </h3>
              <p className="agent-role">
                Your class analyst. Ask in plain English and get clear answers with charts.
              </p>
              <Ticks
                items={["No filters or reports to learn", "Every answer shows the data behind it"]}
              />
            </div>
          </article>

          <article className="card agent lift rc" style={{ transitionDelay: "260ms" }}>
            <div className="agent-art" aria-hidden="true">
              <div className="glow" />
              <div className="art-card" style={{ display: "grid", gap: 10 }}>
                <div className="art-meta">
                  <span>Lab report 4</span>
                  <span>52 min · 3 sessions</span>
                </div>
                <div className="mini-tl">
                  {timeline.map((bar, i) => (
                    <span key={i} className={bar.kind} style={{ height: `${bar.h}%` }} />
                  ))}
                </div>
                <div className="art-meta">
                  <span>Mon</span>
                  <span style={{ color: "var(--text)" }}>Paste · 14:32</span>
                  <span>Wed</span>
                </div>
              </div>
            </div>
            <div className="agent-body">
              <h3 className="agent-name">
                <span className="avatar" aria-hidden="true">
                  <RotateCcwClock size={16} strokeWidth={1.5} />
                </span>
                Trace<span className="agent-for">for teachers</span>
              </h3>
              <p className="agent-role">
                Records how an assignment was written, so you can replay the process instead of
                guessing.
              </p>
              <Ticks
                items={[
                  "Typing, pastes and time spent, on one timeline",
                  "Neutral evidence; it never accuses anyone",
                ]}
              />
            </div>
          </article>
        </div>
      </div>
    </Section>
  );
}
