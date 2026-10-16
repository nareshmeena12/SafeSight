"use client";

import { BookOpen, Check, CircleMinus, MessageSquare } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { Section, SectionHead } from "./section";

const question =
  "Solve Q3: 2 kg of water at 100 °C absorbs 4,514 kJ and fully evaporates at constant temperature. Find the entropy change.";

/**
 * Before and after: a generic chatbot hands over the solution, Sage asks a
 * question back. Side by side on desktop; a Generic AI / Sage toggle on phones.
 */
export function Compare() {
  const [show, setShow] = useState<"sage" | "generic">("sage");

  return (
    <Section id="demo" labelledBy="demo-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="See Sage in action"
          titleId="demo-title"
          title={
            <>
              Same question. <em>Very different outcome.</em>
            </>
          }
          lead="A student asks for the answer to a graded thermodynamics problem. Here is what happens next."
        />
        <div className="seg" role="group" aria-label="Compare responses">
          <button
            type="button"
            aria-pressed={show === "generic"}
            onClick={() => setShow("generic")}
          >
            Generic AI
          </button>
          <button
            type="button"
            className="is-sage"
            aria-pressed={show === "sage"}
            onClick={() => setShow("sage")}
          >
            Sage
          </button>
        </div>
        <div className={`compare show-${show} rv`}>
          <div className="cmp-col cmp-col--generic rc" style={{ transitionDelay: "80ms" }}>
            <p className="cmp-label">
              <MessageSquare size={16} strokeWidth={1.5} aria-hidden="true" />A generic chatbot
            </p>
            <figure className="win win--generic" aria-label="A generic chatbot gives the full solution">
              <div className="chat-head">
                <span className="avatar" aria-hidden="true">
                  <MessageSquare size={17} strokeWidth={1.5} />
                </span>
                <div className="chat-id">
                  <span className="chat-name">Chatbot</span>
                  <span className="chat-sub">General-purpose AI</span>
                </div>
              </div>
              <div className="win-body">
                <div className="msg msg--student">
                  <div className="bubble bubble--student">
                    <p>{question}</p>
                  </div>
                </div>
                <div className="msg msg--sage">
                  <div className="bubble bubble--generic">
                    <p>Sure! Here&apos;s the complete solution you can submit:</p>
                    <p className="sol">
                      {"ΔS = Q / T\nT = 100 + 273.15 = 373.15 K\nΔS = 4,514 / 373.15\n"}
                      <b>Final answer: ΔS ≈ 12.10 kJ/K</b>
                    </p>
                    <p style={{ marginTop: 10 }}>Want me to solve Q4 and Q5 as well?</p>
                  </div>
                </div>
              </div>
              <figcaption className="win-out">
                <CircleMinus size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <b>Outcome:</b> answer copied, concept skipped.
                </span>
              </figcaption>
            </figure>
          </div>

          <div className="cmp-col cmp-col--sage rc" style={{ transitionDelay: "200ms" }}>
            <div className="glow" aria-hidden="true" />
            <p className="cmp-label" style={{ position: "relative", zIndex: 1 }}>
              <LogoMark className="size-4" />
              Sage
            </p>
            <figure className="win win--sage" aria-label="Sage asks a guiding question instead">
              <div className="chat-head">
                <span className="avatar" aria-hidden="true">
                  <LogoMark className="size-[18px]" />
                </span>
                <div className="chat-id">
                  <span className="chat-name">Sage</span>
                  <span className="chat-sub">ME-204 · Assignment 3</span>
                </div>
                <div className="badge">
                  <span className="badge-mode">
                    <i aria-hidden="true" />
                    Learn mode
                  </span>
                  <span className="hint">Hint 1 of 5</span>
                </div>
              </div>
              <div className="win-body">
                <div className="msg msg--student">
                  <div className="bubble bubble--student">
                    <p>{question}</p>
                  </div>
                </div>
                <div className="msg msg--sage">
                  <div className="bubble bubble--sage">
                    <p>
                      Let&apos;s work it out together. The water boils at a constant
                      temperature. What does that tell you about how to find ΔS here?
                    </p>
                    <span className="cite">
                      <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
                      Lecture 7 notes, p.12
                    </span>
                  </div>
                </div>
                <div className="msg msg--student">
                  <div className="bubble bubble--student">
                    <p>So ΔS = Q/T, since T doesn&apos;t change?</p>
                  </div>
                </div>
                <div className="msg msg--sage">
                  <div className="bubble bubble--sage">
                    <p>
                      That&apos;s the key idea. One check before you calculate: which
                      temperature scale must T be in? Try it and show me your number.
                    </p>
                  </div>
                </div>
              </div>
              <figcaption className="win-out">
                <Check size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <b>Outcome:</b> the student reasons their way to ΔS = Q/T.
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
        <p className="cmp-caption rv">
          One finishes the homework. <em>The other builds the engineer.</em>
        </p>
      </div>
    </Section>
  );
}
