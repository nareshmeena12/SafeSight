import { Check, X } from "lucide-react";
import { Section, SectionHead } from "./section";

const weDo = [
  {
    title: "Teachers see summaries by default",
    body: "Class patterns first. Individual detail only when a teacher opens it.",
  },
  {
    title: "Students see all their own data",
    body: "Every chat, score and replay about them is visible to them too.",
  },
  {
    title: "Monitor only during announced exams",
    body: "Live Lab Mode runs for the session students were told about, then stops.",
  },
];

const weNever = [
  {
    title: "Train AI models on student data",
    body: "Student work and conversations are never used to train any model.",
  },
  {
    title: "Label anyone as dishonest",
    body: "We show neutral evidence. Judgement stays with the teacher.",
  },
  {
    title: "Monitor outside an exam session",
    body: "No screen tracking during homework, lectures or personal time.",
  },
];

export function PrivacySection() {
  return (
    <Section id="privacy" labelledBy="privacy-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="Privacy first"
          titleId="privacy-title"
          title={
            <>
              Built to guide students, <em>not to watch them.</em>
            </>
          }
        />
        <div className="privacy rv">
          <div className="card pv rc" style={{ transitionDelay: "80ms" }}>
            <h3>
              <span className="pv-ic">
                <Check size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
              What we do
            </h3>
            <ul>
              {weDo.map((item) => (
                <li key={item.title}>
                  <Check size={18} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <b>{item.title}</b>
                    <span>{item.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card pv pv--never rc" style={{ transitionDelay: "180ms" }}>
            <h3>
              <span className="pv-ic">
                <X size={18} strokeWidth={1.5} aria-hidden="true" />
              </span>
              What we never do
            </h3>
            <ul>
              {weNever.map((item) => (
                <li key={item.title}>
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <b>{item.title}</b>
                    <span>{item.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
