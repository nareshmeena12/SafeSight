import { describe, expect, it } from "vitest";
import type { Labels } from "./labels";
import { nextHintLevel } from "./ladder";

const ask: Labels = {
  intent: "answer_seeking",
  attempted: false,
  sharesSolution: false,
  instructionOverride: false,
  distress: "none",
  topic: "",
};

describe("nextHintLevel", () => {
  it("follows the demo: clarify, nudge, guide, then holds without an attempt (Learn)", () => {
    let level: number | null = null;
    const seen: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      level = nextHintLevel({ mode: "learn", current: level, labels: ask });
      seen.push(level);
    }
    expect(seen).toEqual([1, 2, 3, 3, 3]);
  });

  it("needs a real attempt for the parallel example", () => {
    expect(nextHintLevel({ mode: "learn", current: 3, labels: { ...ask, intent: "concept_question", attempted: true } })).toBe(4);
  });

  it("jumps to check work when the student shares a worked attempt", () => {
    expect(nextHintLevel({ mode: "learn", current: 1, labels: { ...ask, attempted: true, sharesSolution: true } })).toBe(5);
  });

  it("skips clarify when the first message already shows work", () => {
    expect(nextHintLevel({ mode: "learn", current: null, labels: { ...ask, intent: "concept_question", attempted: true } })).toBe(2);
  });

  it("gives at least a nudge for concept questions", () => {
    expect(nextHintLevel({ mode: "learn", current: null, labels: { ...ask, intent: "concept_question" } })).toBe(2);
  });

  it("lets Assist mode reach the parallel example without an attempt", () => {
    expect(nextHintLevel({ mode: "assist", current: 3, labels: ask })).toBe(4);
    expect(nextHintLevel({ mode: "learn", current: 3, labels: ask })).toBe(3);
  });

  it("has no ladder in Exam mode or for distress", () => {
    expect(nextHintLevel({ mode: "exam", current: null, labels: ask })).toBeNull();
    expect(nextHintLevel({ mode: "learn", current: 2, labels: { ...ask, intent: "distress", distress: "high" } })).toBeNull();
  });
});
