import { describe, expect, it } from "vitest";
import type { Labels } from "./labels";
import { decidePolicy, EXAMPLE_INTERVAL_MS, governingAssignment, type LadderState } from "./policy";
import { code, essay, exam, labels, thermo } from "./test-fixtures";
import type { SageAssignment } from "./match";

function run(
  l: Partial<Labels>,
  {
    home = thermo as SageAssignment | null,
    matched = null as { assignment: SageAssignment; similarity: number } | null,
    ladder = null as LadderState | null,
    now = Date.now(),
  } = {},
) {
  return decidePolicy({ home, matched, labels: labels(l), ladderFor: () => ladder, now });
}

/** Simulate a conversation: the ladder state carries from turn to turn (as the database does). */
function conversation(turns: Partial<Labels>[], home: SageAssignment = thermo) {
  let ladder: LadderState | null = null;
  return turns.map((t) => {
    const p = decidePolicy({ home, matched: null, labels: labels(t), ladderFor: () => ladder });
    if (p.ladder) ladder = p.ladder;
    return p;
  });
}

describe("governingAssignment", () => {
  it("applies the chat's assignment to anything but a general concept question", () => {
    expect(governingAssignment({ home: thermo, matched: null, labels: labels({ intent: "answer_seeking" }) })?.id).toBe(thermo.id);
    expect(governingAssignment({ home: thermo, matched: null, labels: labels({ intent: "concept" }) })).toBeNull();
  });

  it("applies the assignment to a concept question about its content", () => {
    const g = governingAssignment({ home: thermo, matched: { assignment: thermo, similarity: 0.7 }, labels: labels() });
    expect(g?.id).toBe(thermo.id);
  });

  it("in Explore, applies a matching assignment and nothing else", () => {
    expect(governingAssignment({ home: null, matched: { assignment: thermo, similarity: 0.8 }, labels: labels() })?.id).toBe(thermo.id);
    expect(governingAssignment({ home: null, matched: { assignment: thermo, similarity: 0.3 }, labels: labels() })).toBeNull();
  });

  it("picks the stricter rule when a message matches another assignment", () => {
    const g = governingAssignment({
      home: essay,
      matched: { assignment: thermo, similarity: 0.9 },
      labels: labels({ intent: "answer_seeking" }),
    });
    expect(g?.mode).toBe("learn");
    expect(governingAssignment({ home: null, matched: { assignment: exam, similarity: 0.9 }, labels: labels() })?.mode).toBe("exam");
  });
});

describe("the ladder climbs only on genuine attempts", () => {
  it("holds at Clarify when the student pastes and insists (never on repetition)", () => {
    const steps = conversation([
      { intent: "answer_seeking" },
      { intent: "answer_seeking" },
      { intent: "answer_seeking", claimsPermission: true },
      { intent: "deliverable_request" },
    ]).map((p) => p.step);
    expect(steps).toEqual([1, 1, 1, 1]);
  });

  it("climbs one step per genuine attempt, up to the parallel example", () => {
    const steps = conversation([
      { intent: "answer_seeking" },
      { intent: "attempt", attemptQuality: 0.5 },
      { intent: "answer_seeking" },
      { intent: "attempt", attemptQuality: 0.6 },
      { intent: "attempt", attemptQuality: 0.5 },
      { intent: "attempt", attemptQuality: 0.7 },
    ]).map((p) => p.step);
    expect(steps).toEqual([1, 2, 2, 3, 4, 4]);
  });

  it("ignores fake attempts (quality below 0.5)", () => {
    const steps = conversation([
      { intent: "attempt", attemptQuality: 0.2 },
      { intent: "attempt", attemptQuality: 0.4 },
    ]).map((p) => p.step);
    expect(steps).toEqual([1, 1]);
  });

  it("does not reset in a new chat: the state is per student per assignment", () => {
    const p = run({ intent: "answer_seeking" }, { ladder: { step: 3, attempts: 2, lastExampleAt: null } });
    expect(p.step).toBe(3);
    expect(p.ladder?.climbed).toBe(false);
  });

  it("respects the teacher's maximum hint level and examples switch", () => {
    const capped = { ...thermo, maxHintLevel: 2 };
    expect(run({ intent: "attempt", attemptQuality: 0.9 }, { home: capped, ladder: { step: 2, attempts: 1, lastExampleAt: null } }).step).toBe(2);
    const noExamples = { ...thermo, workedExamples: false };
    const p = run({ intent: "attempt", attemptQuality: 0.6 }, { home: noExamples, ladder: { step: 3, attempts: 2, lastExampleAt: null } });
    expect(p.step).toBe(3);
    expect(p.giveExample).toBe(false);
  });
});

describe("reply kinds", () => {
  it("checks shared working at step 5 and says what's right", () => {
    const p = run({ intent: "attempt", attemptQuality: 0.8, sharesWorking: true });
    expect(p.kind).toBe("check_work");
    expect(p.step).toBe(5);
    expect(p.allowed.join(" ")).toMatch(/correct/);
  });

  it("never confirms or denies a bare final answer", () => {
    const p = run({ intent: "verify_answer", attemptQuality: 0.2 });
    expect(p.kind).toBe("ask_working");
    expect(p.forbidden.join(" ")).toMatch(/right or wrong/);
    expect(p.ladder?.climbed).toBe(false);
  });

  it("explains general concept questions freely", () => {
    const p = run({ intent: "concept" });
    expect(p.kind).toBe("explain");
    expect(p.guard).toBe("light");
  });

  it("explains a concept about the assignment generally, under Learn rules", () => {
    const p = run({ intent: "concept" }, { matched: { assignment: thermo, similarity: 0.7 } });
    expect(p.kind).toBe("concept");
    expect(p.guard).toBe("full");
    expect(p.forbidden.join(" ")).toMatch(/Intermediate values/);
  });

  it("Assist explains fully but never writes the deliverable", () => {
    const p = run({ intent: "deliverable_request" }, { home: essay });
    expect(p.kind).toBe("assist");
    expect(p.forbidden.join(" ")).toMatch(/hand in/);
    expect(p.forbidden.join(" ")).toMatch(/final answer/i);
  });

  it("never writes deliverables in Explore either", () => {
    const p = run({ intent: "deliverable_request" }, { home: null });
    expect(p.kind).toBe("assist");
    expect(p.guard).toBe("full");
  });

  it("forbids full code in a code assignment", () => {
    expect(run({ intent: "answer_seeking" }, { home: code }).forbidden.join(" ")).toMatch(/code/);
  });

  it("refuses jailbreaks with a fixed reply and flags them", () => {
    const p = run({ intent: "jailbreak" });
    expect(p.kind).toBe("jailbreak");
    expect(p.flags.jailbreak).toBe(true);
  });

  it("switches Sage off for Exam mode, including from Explore", () => {
    expect(run({ intent: "concept" }, { home: exam }).kind).toBe("exam_off");
    const p = run({ intent: "answer_seeking" }, { home: null, matched: { assignment: exam, similarity: 0.8 } });
    expect(p.kind).toBe("exam_off");
    expect(p.flags.examAttempt).toBe(true);
  });

  it("puts care first", () => {
    expect(run({ intent: "distress", distress: "high" }, { home: exam }).kind).toBe("care");
  });
});

describe("parallel examples", () => {
  const now = Date.parse("2026-11-06T10:00:00Z");
  it("gives at most one per assignment per hour", () => {
    const recent = new Date(now - EXAMPLE_INTERVAL_MS / 2).toISOString();
    const p = run({ intent: "answer_seeking" }, { ladder: { step: 4, attempts: 3, lastExampleAt: recent }, now });
    expect(p.step).toBe(4);
    expect(p.giveExample).toBe(false);
    const later = run({ intent: "answer_seeking" }, { ladder: { step: 4, attempts: 3, lastExampleAt: new Date(now - EXAMPLE_INTERVAL_MS).toISOString() }, now });
    expect(later.giveExample).toBe(true);
    expect(later.ladder?.lastExampleAt).toBe(new Date(now).toISOString());
  });

  it("must change the scenario and the unknown; essays get no prose", () => {
    const p = run({ intent: "attempt", attemptQuality: 0.6 }, { ladder: { step: 3, attempts: 2, lastExampleAt: null } });
    expect(p.allowed.join(" ")).toMatch(/scenario and the unknown/);
    const e = run({ intent: "answer_seeking" }, { home: essay, ladder: { step: 4, attempts: 3, lastExampleAt: null } });
    expect(e.allowed.join(" ")).toMatch(/no full sentences/);
  });
});
