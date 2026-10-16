"use client";

import { ArrowUp, BookOpen, Check } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";

type Step =
  | { who: "student"; text: string }
  | { who: "sage"; text: string; hint: number; cite?: boolean };

type Msg = {
  who: "student" | "sage";
  text: string;
  typing?: boolean;
  streaming?: boolean;
  cite?: boolean;
};

const script: Step[] = [
  { who: "student", text: "Just give me the answer to Q3, the entropy one." },
  {
    who: "sage",
    hint: 1,
    text: "Let's crack it together. What happens to entropy when heat flows into a system at constant temperature?",
  },
  { who: "student", text: "It increases?" },
  {
    who: "sage",
    hint: 2,
    cite: true,
    text: "Exactly. Now, which formula links heat, temperature and entropy? Page 12 of your notes has it.",
  },
];

const finalMessages: Msg[] = script.map((s) => ({
  who: s.who,
  text: s.text,
  cite: s.who === "sage" && !!s.cite,
}));

/**
 * The hero's scripted Sage chat: the student's message types out in the
 * composer, Sage "thinks", streams a hint word by word, then the whole thing
 * fades and loops. Under reduced motion it shows the finished conversation.
 */
export function HeroChat() {
  const reduce = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState(1);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const updateLast = (patch: Partial<Msg>) =>
      setMsgs((list) => [...list.slice(0, -1), { ...list[list.length - 1], ...patch }]);

    const typeStudent = (text: string, done: () => void) => {
      let n = 0;
      const tick = () => {
        n += 1;
        setDraft(text.slice(0, n));
        if (n < text.length) later(tick, 26 + Math.random() * 34);
        else
          later(() => {
            setDraft("");
            setMsgs((list) => [...list, { who: "student", text }]);
            done();
          }, 420);
      };
      later(tick, 300);
    };

    const sageReply = (step: Extract<Step, { who: "sage" }>, done: () => void) => {
      const words = step.text.split(" ");
      let n = 0;
      setMsgs((list) => [...list, { who: "sage", text: "", typing: true }]);
      const tick = () => {
        n += 1;
        updateLast({ typing: false, streaming: n < words.length, text: words.slice(0, n).join(" ") });
        if (n < words.length) later(tick, 42 + Math.random() * 48);
        else {
          if (step.cite) later(() => updateLast({ cite: true }), 260);
          done();
        }
      };
      later(() => {
        setHint(step.hint);
        tick();
      }, 1100);
    };

    const run = (i: number) => {
      if (i >= script.length) {
        later(() => setFading(true), 4800);
        later(() => {
          setMsgs([]);
          setFading(false);
          setHint(1);
          later(() => run(0), 700);
        }, 5300);
        return;
      }
      const step = script[i];
      if (step.who === "student") typeStudent(step.text, () => later(() => run(i + 1), 450));
      else sageReply(step, () => later(() => run(i + 1), 1200));
    };

    later(() => run(0), 1100);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduce]);

  const shown = reduce ? finalMessages : msgs;
  const hintShown = reduce ? 2 : hint;
  const draftShown = reduce ? "" : draft;

  return (
    <figure
      className="chat"
      aria-label="Example conversation: a student asks Sage for an answer and Sage guides them instead"
    >
      <div className="chat-head">
        <span className="avatar" aria-hidden="true">
          <LogoMark className="size-[18px]" />
        </span>
        <div className="chat-id">
          <span className="chat-name">Sage</span>
          <span className="chat-sub">ME-204 Thermodynamics · Assignment 3</span>
        </div>
        <div className="badge">
          <span className="badge-mode">
            <i aria-hidden="true" />
            Learn mode
          </span>
          <span key={hintShown} className={hintShown === 2 ? "hint bump" : "hint"}>
            Hint {hintShown} of 5
          </span>
        </div>
      </div>

      <div className={fading ? "chat-body is-fading" : "chat-body"}>
        {shown.map((m, i) =>
          m.who === "student" ? (
            <div key={i} className="msg msg--student">
              <div className="bubble bubble--student">
                <p>{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="msg msg--sage">
              <span className="avatar avatar--sm" aria-hidden="true">
                <LogoMark className="size-[15px]" />
              </span>
              <div className="bubble bubble--sage">
                {m.typing ? (
                  <span className="dots" aria-label="Sage is thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
                {m.text ? (
                  <p>
                    {m.text}
                    {m.streaming ? <span className="caret" aria-hidden="true" /> : null}
                  </p>
                ) : null}
                {m.cite ? (
                  <span className="cite">
                    <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
                    Lecture notes, p.12
                  </span>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="composer" aria-hidden="true">
        <div className="composer-text">
          {draftShown ? (
            <>
              <span>{draftShown}</span>
              <span className="caret" />
            </>
          ) : (
            <span className="composer-ph">Ask Sage about this assignment…</span>
          )}
        </div>
        <span className={draftShown ? "send" : "send is-idle"}>
          <ArrowUp size={18} strokeWidth={1.5} />
        </span>
      </div>
      <figcaption className="chat-foot">
        <Check size={14} strokeWidth={1.5} aria-hidden="true" />
        Sage guides you to the answer. It won&apos;t write graded work for you.
      </figcaption>
    </figure>
  );
}
