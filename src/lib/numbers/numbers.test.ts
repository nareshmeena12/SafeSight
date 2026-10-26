import { describe, expect, it } from "vitest";
import { evaluate, FormulaError, formulaNames, parseFormula } from "./expr";
import {
  checkAnswer,
  expectedAnswer,
  fillInstructions,
  formatNumber,
  formulaProblem,
  numberSetSchema,
  parseAnswer,
  sageNumbers,
  studentValues,
  type NumberSet,
  withStudentNumbers,
} from "./numbers";

const calc = (f: string, scope: Record<string, number> = {}) => evaluate(parseFormula(f), scope);

describe("formula parser", () => {
  it("follows the usual order of operations", () => {
    expect(calc("1 + 2 * 3")).toBe(7);
    expect(calc("(1 + 2) * 3")).toBe(9);
    expect(calc("2^3^2")).toBe(512);
    expect(calc("-2^2")).toBe(-4);
    expect(calc("10 / 4 / 5")).toBe(0.5);
  });

  it("knows functions, constants and implicit multiplication", () => {
    expect(calc("sqrt(16) + abs(-2)")).toBe(6);
    expect(calc("ln(e)")).toBeCloseTo(1);
    expect(calc("2 pi")).toBeCloseTo(2 * Math.PI);
    expect(calc("m g h", { m: 2, g: 9.81, h: 10 })).toBeCloseTo(196.2);
    expect(calc("max(2, 3) × 2")).toBe(6);
    expect(calc("P1 V1 ln(V2/V1)", { P1: 100, V1: 0.1, V2: 0.3 })).toBeCloseTo(10.986, 3);
  });

  it("lists the variables a formula uses", () => {
    expect(formulaNames(parseFormula("m * c * (T2 - T1) + pi"))).toEqual(["m", "c", "T2", "T1"]);
  });

  it("refuses anything that isn't arithmetic", () => {
    for (const bad of ["process.exit()", "a; b", "x = 2", "2 +", "(1 + 2", "1 + 2)", "foo(2)", "sqrt 2", "pow(2)", "`1`"]) {
      expect(() => parseFormula(bad), bad).toThrow(FormulaError);
    }
  });
});

const set: NumberSet = numberSetSchema.parse({
  variables: [
    { name: "m", label: "Mass", unit: "kg", min: 0.2, max: 0.8, decimals: 2 },
    { name: "dT", label: "Temperature rise", unit: "K", min: 10, max: 40, decimals: 0 },
  ],
  formula: "m * 4.18 * dT",
  answerLabel: "Heat added",
  answerUnit: "kJ",
  tolerancePct: 1,
});

describe("student values", () => {
  const a = "00000000-0000-4000-8000-000000000204";
  it("are the same every time for one student and assignment", () => {
    const one = studentValues(set.variables, { studentId: "s1", assignmentId: a });
    expect(studentValues(set.variables, { studentId: "s1", assignmentId: a })).toEqual(one);
  });

  it("differ between students and stay inside the ranges with the right decimals", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const v = studentValues(set.variables, { studentId: `student-${i}`, assignmentId: a });
      expect(v.m).toBeGreaterThanOrEqual(0.2);
      expect(v.m).toBeLessThanOrEqual(0.8);
      expect(Number.isInteger(v.dT)).toBe(true);
      expect(v.m.toFixed(2)).toBe(String(v.m.toFixed(2)));
      seen.add(`${v.m}/${v.dT}`);
    }
    expect(seen.size).toBeGreaterThan(25);
  });

  it("give an expected answer from the rounded values", () => {
    expect(expectedAnswer(set, { m: 0.5, dT: 20 })).toBeCloseTo(41.8);
    expect(expectedAnswer({ formula: "1 / (m - m)" }, { m: 1 })).toBeNull();
  });
});

describe("checking answers", () => {
  it("reads the number in what the student typed", () => {
    expect(parseAnswer("41.8")).toBe(41.8);
    expect(parseAnswer("41.8 kJ")).toBe(41.8);
    expect(parseAnswer("Q = −1,234.5 J")).toBe(-1234.5);
    expect(parseAnswer("4.18e1")).toBeCloseTo(41.8);
    expect(parseAnswer("4.18 × 10^1 kJ")).toBeCloseTo(41.8);
    expect(parseAnswer("6.89x10^-4")).toBeCloseTo(6.89e-4);
    expect(parseAnswer("about forty")).toBeNull();
  });

  it("uses a relative tolerance", () => {
    expect(checkAnswer(41.8, 41.6, 1)).toBe("within");
    expect(checkAnswer(41.8, 41.3, 1)).toBe("outside");
    expect(checkAnswer(-10, -10.05, 1)).toBe("within");
    expect(checkAnswer(0, 0, 1)).toBe("within");
    expect(checkAnswer(41.8, null, 1)).toBe("unreadable");
  });

  it("formats numbers without float noise", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(41.80000001)).toBe("41.8");
    expect(formatNumber(1234567)).toBe("1.235e6");
  });
});

describe("validation", () => {
  it("catches unknown names, duplicates and impossible ranges", () => {
    expect(formulaProblem("m * c", set.variables)).toMatch(/"c"/);
    expect(formulaProblem("1 / (dT - 5)", set.variables)).toBeNull();
    expect(formulaProblem("1 / (dT - 10)", set.variables)).toMatch(/no answer/);
    const dupe = numberSetSchema.safeParse({ ...set, variables: [set.variables[0], set.variables[0]] });
    expect(dupe.success).toBe(false);
    const reserved = numberSetSchema.safeParse({ ...set, variables: [{ ...set.variables[0], name: "pi" }] });
    expect(reserved.success).toBe(false);
    const range = numberSetSchema.safeParse({ ...set, variables: [{ ...set.variables[0], min: 1, max: 1 }] });
    expect(range.success).toBe(false);
  });
});

describe("what Sage and students see", () => {
  it("fills placeholders and gives Sage the values and the private answer", () => {
    const values = { m: 0.5, dT: 20 };
    expect(fillInstructions("Heat {m} of water by {dT}. {x} stays.", set, values)).toBe(
      "Heat 0.50 kg of water by 20 K. {x} stays.",
    );
    const sage = sageNumbers(set, values);
    expect(sage.instructions).toContain("Mass: m = 0.50 kg");
    expect(sage.answerKey).toBe("This student's final answer (Heat added): 41.8 kJ");
  });
});

describe("withStudentNumbers", () => {
  it("adds the student's values to the instructions and their answer to the private key", () => {
    const a = { id: "a1", instructions: "Heat {m} of air.", answerKey: "Problem 2: 68.9 kJ" } as Parameters<typeof withStudentNumbers>[0][number];
    const other = { ...a, id: "a2" };
    const [mine, untouched] = withStudentNumbers([a, other], new Map([["a1", set]]), "s1");
    const values = studentValues(set.variables, { studentId: "s1", assignmentId: "a1" });
    expect(mine.instructions).toContain(`Heat ${values.m.toFixed(2)} kg of air.`);
    expect(mine.instructions).toContain("This student's own numbers");
    expect(mine.answerKey).toMatch(/^Problem 2: 68\.9 kJ\nThis student's final answer \(Heat added\): [\d.]+ kJ$/);
    expect(untouched).toBe(other);
  });
});
