import { describe, expect, it } from "vitest";
import { decideFlags } from "./flags";
import type { Intent, Labels } from "./labels";
import { decidePolicy } from "./policy";
import { exam, labels, thermo } from "./test-fixtures";

function flags(l: Partial<Labels>, { recent = [] as (Intent | null)[], jailbreaks = 0, home = thermo, existing = [] as never[] } = {}) {
  const lab = labels(l);
  const policy = decidePolicy({ home, matched: null, labels: lab, ladderFor: () => null });
  return decideFlags({
    policy,
    labels: lab,
    recentIntents: [...recent, lab.intent],
    recentJailbreaks: jailbreaks,
    context: home.title,
    existing,
  });
}

describe("decideFlags", () => {
  it("flags repeated answer-seeking from the third time", () => {
    expect(flags({ intent: "answer_seeking" }, { recent: ["answer_seeking"] })).toEqual([]);
    const f = flags({ intent: "deliverable_request" }, { recent: ["answer_seeking", "concept", "answer_seeking"] });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: "answer_seeking", severity: "low" });
    const five = flags({ intent: "answer_seeking" }, { recent: ["answer_seeking", "answer_seeking", "answer_seeking", "answer_seeking"] });
    expect(five[0].severity).toBe("medium");
  });

  it("does not repeat an open flag of the same type and severity", () => {
    const f = decideFlags({
      policy: decidePolicy({ home: thermo, matched: null, labels: labels({ intent: "answer_seeking" }), ladderFor: () => null }),
      labels: labels({ intent: "answer_seeking" }),
      recentIntents: ["answer_seeking", "answer_seeking", "answer_seeking"],
      recentJailbreaks: 0,
      context: thermo.title,
      existing: [{ type: "answer_seeking", severity: "low" }],
    });
    expect(f).toEqual([]);
  });

  it("flags jailbreaks, more strongly the second time in a day", () => {
    expect(flags({ intent: "jailbreak" })[0]).toMatchObject({ type: "instruction_override", severity: "low" });
    expect(flags({ intent: "jailbreak" }, { jailbreaks: 1 })[0].severity).toBe("medium");
  });

  it("flags Exam-mode use", () => {
    expect(flags({ intent: "concept" }, { home: exam })[0]).toMatchObject({ type: "exam_mode_attempt", severity: "medium" });
  });

  it("raises a private wellbeing flag on distress", () => {
    expect(flags({ intent: "distress", distress: "high" })[0]).toMatchObject({ type: "wellbeing", severity: "high" });
    expect(flags({ intent: "concept", distress: "low" })[0]).toMatchObject({ type: "wellbeing", severity: "medium" });
  });

  it("keeps reasons neutral", () => {
    const all = [
      ...flags({ intent: "jailbreak" }, { jailbreaks: 2 }),
      ...flags({ intent: "answer_seeking" }, { recent: ["answer_seeking", "answer_seeking"] }),
    ];
    for (const f of all) expect(f.reason).not.toMatch(/cheat|catch|spy|ai-generated/i);
  });
});
