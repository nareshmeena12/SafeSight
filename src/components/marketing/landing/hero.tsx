import { ArrowRight, Check, ChartLine, CirclePlay } from "lucide-react";
import Link from "next/link";
import { HeroChat } from "./hero-chat";

const words = [
  { text: "AI", delay: 80 },
  { text: "that", delay: 140 },
  { text: "teaches,", delay: 200, em: true },
  { text: "not", delay: 260, br: true },
  { text: "answers.", delay: 320 },
];

const bars = [30, 46, 100, 38, 22];

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div>
          <div className="pill rise" style={{ animationDelay: "0ms" }}>
            <span className="live-dot" aria-hidden="true" />
            <span>
              Built at <b>IIT Mandi</b>
            </span>
            <span className="pill-sep" aria-hidden="true" />
            <span>Now piloting</span>
          </div>
          <h1 className="h-display" id="hero-title">
            {words.map((w) => (
              <span key={w.text} style={{ display: "contents" }}>
                {w.br ? <br /> : null}
                <span className="w" style={{ animationDelay: `${w.delay}ms` }}>
                  {w.em ? <em>{w.text}</em> : w.text}
                </span>{" "}
              </span>
            ))}
          </h1>
          <p className="lead rise" style={{ animationDelay: "440ms" }}>
            SafeSight gives every student a tutor that builds real understanding, and gives
            every teacher a clear view of how AI is used in their class.
          </p>
          <div className="hero-ctas rise" style={{ animationDelay: "540ms" }}>
            <Link className="btn btn--primary" href="#pilot">
              Request a pilot
              <ArrowRight className="nudge" size={18} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link className="btn btn--secondary" href="#demo">
              <CirclePlay size={18} strokeWidth={1.5} aria-hidden="true" />
              See Sage in action
            </Link>
          </div>
          <ul className="assure rise" style={{ animationDelay: "640ms" }}>
            <li>
              <Check size={16} strokeWidth={1.5} aria-hidden="true" />
              Grounded in your own course notes
            </li>
            <li>
              <Check size={16} strokeWidth={1.5} aria-hidden="true" />
              You set the rules for every assignment
            </li>
          </ul>
        </div>

        <div className="stage">
          <div className="glow" aria-hidden="true" />
          <HeroChat />
          <div
            className="lens-card"
            role="img"
            aria-label="Lens, teacher view: Q3 is where most of the class asked for hints this week"
          >
            <div className="lens-top">
              <ChartLine size={15} strokeWidth={1.5} aria-hidden="true" />
              Lens<span className="lens-tag">Teacher view</span>
            </div>
            <p className="lens-text">
              Q3 (entropy) is where most of your class asked for hints this week.
            </p>
            <div className="bars" aria-hidden="true">
              {bars.map((h, i) => (
                <span key={i} className={i === 2 ? "on" : undefined} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="bar-labels" aria-hidden="true">
              {bars.map((_, i) => (
                <span key={i} className={i === 2 ? "on" : undefined}>
                  Q{i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
