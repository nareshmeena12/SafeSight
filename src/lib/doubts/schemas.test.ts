import { describe, expect, it } from "vitest";
import { usesBannedWords } from "@/lib/trace/summary";
import {
  SUMMARY_SYSTEM,
  answerEmail,
  chatTranscript,
  createDoubtSchema,
  fallbackSummary,
  summaryPrompt,
  tidySummary,
  type ChatLine,
} from "./schemas";

const chat: ChatLine[] = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "Hi! What are you working on?" },
  { role: "user", content: "How do I find the work in a polytropic process?" },
  { role: "assistant", content: "Which formula did you start from?" },
  { role: "user", content: "I tried W = (P2V2 - P1V1)/(1-n) and got 7.7 kJ" },
];

describe("fallbackSummary", () => {
  it("uses the student's own words: their latest real question and what they tried", () => {
    const s = fallbackSummary(chat);
    expect(s.question).toBe("I tried W = (P2V2 - P1V1)/(1-n) and got 7.7 kJ");
    expect(s.tried).toBe("");
    const asked = fallbackSummary([...chat, { role: "user", content: "Why is the work sign positive here?" }]);
    expect(asked.question).toBe("Why is the work sign positive here?");
    expect(asked.tried).toContain("7.7 kJ");
  });

  it("never takes Sage's words", () => {
    const s = fallbackSummary(chat);
    expect(`${s.question} ${s.tried}`).not.toMatch(/Which formula/);
  });

  it("is empty for an empty chat", () => {
    expect(fallbackSummary([])).toEqual({ question: "", tried: "", stuckOn: "" });
  });
});

describe("summary prompt", () => {
  it("labels who said what and keeps only the last 24 messages", () => {
    const long = Array.from({ length: 30 }, (_, i): ChatLine => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    const t = chatTranscript(long);
    expect(t.split("\n")).toHaveLength(24);
    expect(t).toMatch(/^STUDENT: m6/);
    expect(summaryPrompt({ course: "ME201 Thermodynamics", assignment: "Problem set 3" }, chat)).toContain("Assignment: Problem set 3");
  });

  it("keeps the product's words neutral", () => {
    expect(usesBannedWords(SUMMARY_SYSTEM)).toBe(false);
  });

  it("tidies the model's output to the stored limits", () => {
    const s = tidySummary({ question: `  ${"q".repeat(1500)} `, tried: "a   b", stuckOn: "" });
    expect(s.question.length).toBeLessThanOrEqual(1000);
    expect(s.tried).toBe("a b");
  });
});

describe("createDoubtSchema", () => {
  const base = { courseId: "00000000-0000-4000-8000-000000000101", question: "How do I start problem 2?" };
  it("accepts a minimal doubt with defaults", () => {
    expect(createDoubtSchema.parse(base)).toMatchObject({ tried: "", stuckOn: "", shareChat: false });
  });
  it("rejects an empty question", () => {
    expect(createDoubtSchema.safeParse({ ...base, question: "  ?" }).success).toBe(false);
  });
});

describe("answerEmail", () => {
  it("escapes the student's text in the HTML", () => {
    const e = answerEmail({
      studentFirstName: "Riya",
      course: "ME201 Thermodynamics",
      question: "Is <b>W</b> negative?",
      answer: "Yes — for compression.",
      answeredBy: "Kavita Sharma",
      link: "https://safesight.in/student/doubts",
      announcement: false,
    });
    expect(e.subject).toBe("Your question in ME201 Thermodynamics has an answer");
    expect(e.html).toContain("Is &lt;b&gt;W&lt;/b&gt; negative?");
    expect(e.text).toContain("Hi Riya,");
    expect(usesBannedWords(`${e.subject} ${e.text}`)).toBe(false);
  });
});
