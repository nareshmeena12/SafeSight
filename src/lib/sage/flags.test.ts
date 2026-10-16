import { describe, expect, it } from "vitest";
import { decideFlags } from "./flags";
import type { Labels } from "./labels";

const labels: Labels = {
  intent: "answer_seeking",
  attempted: false,
  sharesSolution: false,
  instructionOverride: false,
  distress: "none",
  topic: "",
};
const common = { mode: "learn" as const, recentOverrides: 0, assignmentTitle: "Problem set 3", existing: [] };

describe("decideFlags", () => {
  it("flags repeated answer-seeking on the third ask", () => {
    expect(decideFlags({ ...common, labels, recentIntents: ["answer_seeking", "pasted_question"] })).toEqual([]);
    const flags = decideFlags({
      ...common,
      labels,
      recentIntents: ["pasted_question", "answer_seeking", "answer_seeking"],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "answer_seeking", severity: "low" });
    expect(flags[0].reason).toContain("3 times");
  });

  it("raises answer-seeking to medium at five", () => {
    const flags = decideFlags({ ...common, labels, recentIntents: Array(5).fill("answer_seeking") });
    expect(flags[0].severity).toBe("medium");
  });

  it("does not repeat an open flag from the last day", () => {
    const flags = decideFlags({
      ...common,
      labels,
      recentIntents: Array(4).fill("answer_seeking"),
      existing: [{ type: "answer_seeking", severity: "low" }],
    });
    expect(flags).toEqual([]);
  });

  it("flags any use in Exam mode", () => {
    const flags = decideFlags({
      ...common,
      mode: "exam",
      labels: { ...labels, intent: "concept_question" },
      recentIntents: ["concept_question"],
    });
    expect(flags.map((f) => f.type)).toEqual(["exam_mode_attempt"]);
  });

  it("raises a high wellbeing flag for distress", () => {
    const flags = decideFlags({
      ...common,
      labels: { ...labels, intent: "distress", distress: "high" },
      recentIntents: ["distress"],
    });
    expect(flags).toEqual([expect.objectContaining({ type: "wellbeing", severity: "high" })]);
  });

  it("flags instruction overrides, medium on the second", () => {
    const first = decideFlags({ ...common, labels: { ...labels, instructionOverride: true }, recentIntents: ["answer_seeking"] });
    expect(first).toEqual([expect.objectContaining({ type: "instruction_override", severity: "low" })]);
    const second = decideFlags({
      ...common,
      recentOverrides: 1,
      labels: { ...labels, instructionOverride: true },
      recentIntents: ["answer_seeking"],
    });
    expect(second[0].severity).toBe("medium");
  });

  it("uses neutral words in reasons", () => {
    const all = decideFlags({
      ...common,
      mode: "exam",
      labels: { ...labels, instructionOverride: true, distress: "high" },
      recentIntents: Array(6).fill("answer_seeking"),
    });
    for (const f of all) expect(f.reason).not.toMatch(/cheat|catch|spy|ai-generated/i);
  });
});
