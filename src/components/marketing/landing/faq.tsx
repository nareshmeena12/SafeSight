"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Section, SectionHead } from "./section";

const faqs = [
  {
    q: "Can't students just use ChatGPT instead?",
    a: "They can, and some will. SafeSight doesn't try to wall off the internet outside exams. It earns its place by being more useful for coursework: Sage knows your notes, the assignment and where each student is stuck. And because Trace and Lens show how work was made, you can grade the thinking, not just the final answer.",
  },
  {
    q: "Which AI model does Sage use, and where does the data go?",
    a: "Sage is built on leading large language models accessed through enterprise APIs that do not train on your data. Your notes and your students' work stay in your institution's workspace, and student data is never used to train AI models. We'll share the exact model and hosting region for your pilot in writing before it starts.",
  },
  {
    q: "Does it work for coding assignments?",
    a: "Partly, today. Sage already explains programming concepts and error messages with hints instead of solutions. Full code review with hints, and Trace for coding sessions, are planned for the pilot semester.",
  },
  {
    q: "How long does setup take for a course?",
    a: "Most of it is uploading your lecture notes and choosing Learn, Assist or Exam mode for each assignment. During a pilot we sit with you and set up the first course together, then students join with a class link.",
  },
  {
    q: "Is it free for students?",
    a: "Yes. Students never pay. SafeSight is licensed by the institution, and we agree pilot terms with each college before anything starts.",
  },
  {
    q: "How does Live Lab Mode work on our lab computers?",
    a: "Your lab admin installs the SafeSight Lab extension in Chrome on each lab PC, once. It stays idle until a student joins an announced exam session with its code. During the session it blocks a list of AI sites and sends each seat's status to the teacher's grid, and when the session ends it switches off on its own. It covers Chrome only and cannot see phones, so an invigilator is still part of the plan.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" labelledBy="faq-title">
      <div className="wrap faq">
        <div className="faq-aside rv">
          <SectionHead
            align="left"
            style={{ marginBottom: 0 }}
            eyebrow="FAQ"
            titleId="faq-title"
            title={
              <>
                Questions professors <em>ask us.</em>
              </>
            }
            lead={
              <>
                Something we haven&apos;t covered? <Link href="#pilot">Write to us</Link> with
                your pilot request and we&apos;ll answer it there.
              </>
            }
          />
        </div>
        <ul className="qa-list rv">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className={isOpen ? "qa is-open" : "qa"}>
                <h3 style={{ margin: 0 }}>
                  <button
                    type="button"
                    className="qa-btn"
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="qa-plus" aria-hidden="true">
                      <Plus size={16} strokeWidth={1.5} />
                    </span>
                  </button>
                </h3>
                <div className="qa-a" id={`faq-a-${i}`} hidden={!isOpen}>
                  <p>{item.a}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
