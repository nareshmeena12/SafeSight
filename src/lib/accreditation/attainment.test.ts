import { describe, expect, it } from "vitest";
import {
  assignmentScores,
  coAttainment,
  DEFAULT_SETTINGS,
  formatPct,
  levelFor,
  mappingAverages,
  poAttainment,
  programAttainment,
  selfStudyScoresByOutcome,
  testScoresByOutcome,
  type Evidence,
  type Outcome,
  type ProgramOutcome,
} from "./attainment";

const co1: Outcome = { id: "co1", code: "CO1", description: "Apply the first law" };
const co2: Outcome = { id: "co2", code: "CO2", description: "Evaluate entropy change" };
const co3: Outcome = { id: "co3", code: "CO3", description: "Analyse cycles" };
const po1: ProgramOutcome = { id: "po1", code: "PO1", title: "Engineering knowledge", description: "…", kind: "po" };
const po2: ProgramOutcome = { id: "po2", code: "PO2", title: "Problem analysis", description: "…", kind: "po" };
const pso1: ProgramOutcome = { id: "pso1", code: "PSO1", title: "", description: "Thermal systems", kind: "pso" };

const scores = (...values: number[]) => values.map((score, i) => ({ student: `s${i}`, score }));

function evidence(id: string, byOutcome: Evidence["byOutcome"], weight = 1, minStudents = 1, kind: Evidence["kind"] = "test"): Evidence {
  return { id, kind, title: id, weight, source: "", byOutcome, minStudents };
}

describe("levelFor", () => {
  it("uses the thresholds inclusively", () => {
    expect(levelFor(70, DEFAULT_SETTINGS)).toBe(3);
    expect(levelFor(69.99, DEFAULT_SETTINGS)).toBe(2);
    expect(levelFor(60, DEFAULT_SETTINGS)).toBe(2);
    expect(levelFor(50, DEFAULT_SETTINGS)).toBe(1);
    expect(levelFor(49.9, DEFAULT_SETTINGS)).toBe(0);
  });
});

describe("testScoresByOutcome", () => {
  const questions = [
    { label: "Q1", maxMarks: 10, outcomeIds: ["co1"] },
    { label: "Q2", maxMarks: 10, outcomeIds: ["co1", "co2"] },
    { label: "Q3", maxMarks: 5, outcomeIds: ["co2"] },
  ];

  it("divides marks by the maximum of the attempted questions mapped to the CO", () => {
    const out = testScoresByOutcome(questions, [
      { student: "A", marks: [8, 4, 5], absent: false },
      // Q1 not attempted: CO1 is out of Q2's 10 only.
      { student: "B", marks: [null, 7, null], absent: false },
      { student: "C", marks: [null, null, null], absent: true },
      // Nothing attempted for CO2: left out of CO2.
      { student: "D", marks: [6, null, null], absent: false },
    ]);
    expect(out.co1.scores).toEqual([
      { student: "A", score: 12 / 20 },
      { student: "B", score: 0.7 },
      { student: "D", score: 0.6 },
    ]);
    expect(out.co2.scores).toEqual([
      { student: "A", score: 9 / 15 },
      { student: "B", score: 0.7 },
    ]);
    expect(out.co1.detail).toBe("Q1, Q2 (20 marks)");
  });

  it("clamps marks to the question's range", () => {
    const out = testScoresByOutcome([{ label: "Q1", maxMarks: 10, outcomeIds: ["co1"] }], [{ student: "A", marks: [14], absent: false }]);
    expect(out.co1.scores[0].score).toBe(1);
  });
});

describe("assignmentScores", () => {
  it("prefers approved feedback marks, then the number check", () => {
    const out = assignmentScores([
      { student: "A", feedback: [{ maxPoints: 10, points: 7 }, { maxPoints: 5, points: 5 }, { maxPoints: null, points: null }], numbers: "outside" },
      { student: "B", feedback: [{ maxPoints: null, points: null }], numbers: "within" },
      { student: "C", feedback: null, numbers: "unreadable" },
      { student: "D", feedback: null, numbers: null },
    ]);
    expect(out.scores).toEqual([
      { student: "A", score: 12 / 15 },
      { student: "B", score: 1 },
      { student: "C", score: 0 },
    ]);
    expect(out.fromFeedback).toBe(1);
    expect(out.fromNumbers).toBe(2);
  });
});

describe("selfStudyScoresByOutcome", () => {
  it("averages each student's items on mapped (or closely related) topics", () => {
    const out = selfStudyScoresByOutcome(
      [
        { student: "A", topic: "Entropy change", score: 1 },
        { student: "A", topic: "entropy", score: 0.5 },
        { student: "B", topic: "Otto cycle", score: 1 },
      ],
      [{ topic: "Entropy", outcomeId: "co2" }],
    );
    expect(out.co2.scores).toEqual([{ student: "A", score: 0.75 }]);
  });
});

describe("coAttainment", () => {
  it("weights each assessment's share of students and explains the sum", () => {
    const [r] = coAttainment(
      [co1],
      [
        evidence("Mid-sem", { co1: { scores: scores(0.9, 0.7, 0.5, 0.6), detail: "Q1" } }, 1),
        evidence("End-sem", { co1: { scores: scores(0.8, 0.3), detail: "Q2" } }, 2),
      ],
      DEFAULT_SETTINGS,
    );
    // Mid-sem: 3 of 4 reached 60% = 75%. End-sem: 1 of 2 = 50%. (1×75 + 2×50) ÷ 3 = 58.3% → level 1.
    expect(r.rows.map((x) => [x.assessed, x.attained, x.pct])).toEqual([
      [4, 3, 75],
      [2, 1, 50],
    ]);
    expect(r.pct).toBeCloseTo(58.333, 2);
    expect(r.level).toBe(1);
    expect(r.met).toBe(false);
    expect(r.formula).toContain("(1 × 75.0% + 2 × 50.0%) ÷ 3 = 58.3%");
    expect(r.formula).toContain("Level 1");
  });

  it("hides and skips self-study with fewer than 3 students, and weight-0 rows", () => {
    const [r] = coAttainment(
      [co1],
      [
        evidence("Test", { co1: { scores: scores(1, 1), detail: "" } }),
        evidence("practice", { co1: { scores: scores(0, 0), detail: "" } }, 0.5, 3, "practice"),
        evidence("mock", { co1: { scores: scores(0, 0, 0), detail: "" } }, 0, 3, "mock"),
      ],
      DEFAULT_SETTINGS,
    );
    expect(r.rows[1]).toMatchObject({ assessed: null, attained: null, pct: null, counted: false });
    expect(r.rows[1].note).toMatch(/Fewer than 3 students/);
    expect(r.rows[2]).toMatchObject({ assessed: 3, pct: 0, counted: false, note: "Weight 0 — shown, not counted" });
    expect(r.pct).toBe(100);
    expect(r.level).toBe(3);
  });

  it("marks COs without results as not assessed", () => {
    const [a, b] = coAttainment([co1, co2], [evidence("Test", { co1: { scores: [], detail: "" } })], DEFAULT_SETTINGS);
    expect(a.level).toBeNull();
    expect(a.formula).toMatch(/none of its assessments/);
    expect(b.formula).toMatch(/no assessment is mapped/);
  });
});

describe("poAttainment", () => {
  it("is Σ(mapping × level) ÷ Σ mapping over assessed COs", () => {
    const co = coAttainment(
      [co1, co2, co3],
      [
        evidence("T", {
          co1: { scores: scores(1, 1, 1, 0), detail: "" }, // 75% → 3
          co2: { scores: scores(1, 1, 0, 0), detail: "" }, // 50% → 1
        }),
      ],
      DEFAULT_SETTINGS,
    );
    const po = poAttainment(
      co,
      [
        { outcomeId: "co1", programOutcomeId: "po1", level: 3 },
        { outcomeId: "co2", programOutcomeId: "po1", level: 2 },
        { outcomeId: "co3", programOutcomeId: "po1", level: 1 },
        { outcomeId: "co3", programOutcomeId: "po2", level: 3 },
      ],
      [po1, po2, pso1],
    );
    // (3×3 + 2×1) ÷ (3 + 2) = 2.2; CO3 isn't assessed, so it's left out.
    expect(po[0].value).toBeCloseTo(2.2, 5);
    expect(po[0].formula).toContain("(3 × 3 + 2 × 1) ÷ (3 + 2) = 2.20");
    expect(po[0].formula).toContain("CO3 not assessed yet");
    expect(po[1].value).toBeNull();
    expect(po[2].formula).toBe("No course outcome is mapped to it.");
  });

  it("averages the filled cells of the matrix", () => {
    expect(
      mappingAverages(
        [co1, co2],
        [
          { outcomeId: "co1", programOutcomeId: "po1", level: 3 },
          { outcomeId: "co2", programOutcomeId: "po1", level: 2 },
        ],
        [po1, po2],
      ),
    ).toEqual([2.5, null]);
  });
});

describe("programAttainment", () => {
  it("is the mean of the courses with a value", () => {
    const [a, b] = programAttainment(
      [po1, po2],
      [
        { courseId: "c1", label: "ME201", values: { po1: 2.4, po2: null } },
        { courseId: "c2", label: "ME204", values: { po1: 1.8 } },
      ],
    );
    expect(a.value).toBeCloseTo(2.1, 5);
    expect(a.courses).toBe(2);
    expect(a.formula).toBe("(2.40 + 1.80) ÷ 2 = 2.10 (mean over ME201, ME204).");
    expect(b.value).toBeNull();
  });
});

describe("formatPct", () => {
  it("rounds to one decimal and shows a dash for nothing", () => {
    expect(formatPct(58.3333)).toBe("58.3%");
    expect(formatPct(null)).toBe("—");
  });
});
