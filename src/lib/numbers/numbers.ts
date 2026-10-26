import { z } from "zod";
import type { SageAssignment } from "@/lib/sage/match";
import { evaluate, FormulaError, formulaNames, parseFormula, reservedNames } from "./expr";

/**
 * Per-student numbers (S18). The teacher marks the variables of a numeric
 * problem with ranges and gives a formula for the answer. Every student gets
 * their own values, picked deterministically from the student and assignment
 * ids, so the same student always sees the same numbers and nothing has to be
 * stored. Submitted answers are checked against the formula with a tolerance.
 * Pure (no database), unit-tested.
 */

export const MAX_VARIABLES = 8;

export const variableSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/, "Use a short name: letters, digits or _, starting with a letter (e.g. m, T1).")
      .refine((n) => !reservedNames.has(n), "That name is taken by a maths function or constant."),
    label: z.string().trim().max(60, "Keep the label under 60 characters.").default(""),
    unit: z.string().trim().max(20, "Keep the unit under 20 characters.").default(""),
    min: z.number("Give the lowest value.").finite(),
    max: z.number("Give the highest value.").finite(),
    /** Decimal places students see (0–4). */
    decimals: z.number().int().min(0).max(4).default(2),
  })
  .refine((v) => v.max > v.min, { message: "The highest value must be above the lowest.", path: ["max"] });
export type NumberVariable = z.infer<typeof variableSchema>;

export const numberSetSchema = z
  .object({
    variables: z
      .array(variableSchema)
      .min(1, "Add at least one variable.")
      .max(MAX_VARIABLES, `Use at most ${MAX_VARIABLES} variables.`),
    formula: z.string().trim().min(1, "Write a formula for the answer.").max(500, "Keep the formula under 500 characters."),
    answerLabel: z.string().trim().max(60, "Keep the label under 60 characters.").default(""),
    answerUnit: z.string().trim().max(20, "Keep the unit under 20 characters.").default(""),
    /** Relative tolerance in percent for the auto-check. */
    tolerancePct: z.number().min(0.01, "Allow at least 0.01%.").max(20, "Keep the tolerance at 20% or less.").default(1),
  })
  .superRefine((set, ctx) => {
    const names = set.variables.map((v) => v.name);
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) ctx.addIssue({ code: "custom", path: ["variables"], message: `"${dupe}" is used twice.` });
    const problem = formulaProblem(set.formula, set.variables);
    if (problem) ctx.addIssue({ code: "custom", path: ["formula"], message: problem });
  });
export type NumberSet = z.infer<typeof numberSetSchema>;

/**
 * Why a formula can't be used with these variables, or null if it can: it
 * must parse, use only the variables (and pi, e), and give a finite number at
 * the ends and middle of every range.
 */
export function formulaProblem(formula: string, variables: NumberVariable[]): string | null {
  let tree;
  try {
    tree = parseFormula(formula);
  } catch (e) {
    return e instanceof FormulaError ? e.message : "The formula couldn't be read.";
  }
  const known = new Set(variables.map((v) => v.name));
  const unknown = formulaNames(tree).filter((n) => !known.has(n));
  if (unknown.length) return `Add ${unknown.map((n) => `"${n}"`).join(", ")} as a variable, or remove it from the formula.`;
  for (const at of [0, 0.5, 1]) {
    const scope = Object.fromEntries(variables.map((v) => [v.name, v.min + (v.max - v.min) * at]));
    let value: number;
    try {
      value = evaluate(tree, scope);
    } catch (e) {
      return e instanceof FormulaError ? e.message : "The formula couldn't be worked out.";
    }
    if (!Number.isFinite(value)) {
      return "The formula has no answer for some values in the ranges (e.g. dividing by zero). Check the ranges.";
    }
  }
  return null;
}

// ---------------------------------------------------------------- values

/** 32-bit FNV-1a: a stable seed from text. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: one number in [0, 1) from a seed. */
function unit(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function roundTo(value: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** The student's own value for each variable: same student + assignment → same numbers. */
export function studentValues(
  variables: NumberVariable[],
  { studentId, assignmentId }: { studentId: string; assignmentId: string },
): Record<string, number> {
  return Object.fromEntries(
    variables.map((v) => {
      const u = unit(hash(`${assignmentId}:${studentId}:${v.name}`));
      const value = roundTo(v.min + u * (v.max - v.min), v.decimals);
      // Rounding can step just outside the range; clamp to it.
      return [v.name, Math.min(Math.max(value, roundTo(v.min, v.decimals)), roundTo(v.max, v.decimals))];
    }),
  );
}

/** The expected answer for these values (the rounded values the student sees), or null. */
export function expectedAnswer(set: Pick<NumberSet, "formula">, values: Record<string, number>): number | null {
  try {
    const value = evaluate(parseFormula(set.formula), values);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- checking

/**
 * Reads the first number in a student's answer: "68.9", "68.9 kJ",
 * "-1,234.5", "6.89e4", "6.89 × 10^4", "6.89x10^-4". Null if there is none.
 */
export function parseAnswer(text: string): number | null {
  const clean = text
    .replace(/[−–]/g, "-")
    .replace(/(\d)[,\s  ](?=\d{3}\b)/g, "$1")
    .trim();
  const m = /(-?\s?(?:\d+\.?\d*|\.\d+))(?:\s*(?:[eE]([+-]?\d+)|\s*[x×*]\s*10\s*\^\s*\(?([+-]?\d+)\)?))?/.exec(clean);
  if (!m) return null;
  const mantissa = Number(m[1].replace(/\s/g, ""));
  const exponent = m[2] ?? m[3];
  const value = exponent === undefined ? mantissa : mantissa * 10 ** Number(exponent);
  return Number.isFinite(value) ? value : null;
}

export type CheckResult = "within" | "outside" | "unreadable";

/** Is the given answer within the relative tolerance of the expected one? */
export function checkAnswer(expected: number, given: number | null, tolerancePct: number): CheckResult {
  if (given === null || !Number.isFinite(given)) return "unreadable";
  const allowed = Math.abs(expected) * (tolerancePct / 100);
  // An expected answer of 0 can't take a relative tolerance: allow a tiny absolute one.
  const ok = expected === 0 ? Math.abs(given) <= 1e-9 : Math.abs(given - expected) <= allowed + 1e-12;
  return ok ? "within" : "outside";
}

/** A number for people: up to 4 significant figures, no float noise. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3)) return value.toPrecision(4).replace("e+", "e");
  return String(Number(value.toPrecision(4)));
}

/** A variable's value as the student sees it, e.g. "m = 0.43 kg". */
export function formatValue(v: NumberVariable, value: number) {
  return `${v.name} = ${value.toFixed(v.decimals)}${v.unit ? ` ${v.unit}` : ""}`;
}

/** Replaces {name} placeholders in the instructions with the student's values. */
export function fillInstructions(
  instructions: string,
  set: { variables: Pick<NumberVariable, "name" | "unit" | "decimals">[] },
  values: Record<string, number>,
) {
  const byName = new Map(set.variables.map((v) => [v.name, v]));
  return instructions.replace(/\{([A-Za-z][A-Za-z0-9_]{0,15})\}/g, (m, name: string) => {
    const v = byName.get(name);
    return v && values[name] !== undefined ? `${values[name].toFixed(v.decimals)}${v.unit ? ` ${v.unit}` : ""}` : m;
  });
}

/**
 * The lines Sage gets for one student (S18): their own values go into the
 * assignment's instructions (the student sees them, so the guard lets them
 * through and Sage works with them), and their expected answer goes into the
 * private answer key (so the guard never lets it out).
 */
export function sageNumbers(set: NumberSet, values: Record<string, number>) {
  const list = set.variables.map((v) => `- ${v.label ? `${v.label}: ` : ""}${formatValue(v, values[v.name])}`).join("\n");
  const expected = expectedAnswer(set, values);
  return {
    instructions: `This student's own numbers (every student has different values; always use these):\n${list}`,
    answerKey:
      expected === null
        ? ""
        : `This student's final answer${set.answerLabel ? ` (${set.answerLabel})` : ""}: ${formatNumber(expected)}${set.answerUnit ? ` ${set.answerUnit}` : ""}`,
  };
}

/**
 * Gives Sage this student's own numbers: values in the instructions (seen by
 * the student) and the expected answer in the private answer key (protected
 * by the guard). Assignments without a number set are returned as they are.
 */
export function withStudentNumbers(
  assignments: SageAssignment[],
  sets: Map<string, NumberSet>,
  studentId: string,
): SageAssignment[] {
  return assignments.map((a) => {
    const set = sets.get(a.id);
    if (!set) return a;
    const values = studentValues(set.variables, { studentId, assignmentId: a.id });
    const extra = sageNumbers(set, values);
    return {
      ...a,
      instructions: [fillInstructions(a.instructions, set, values).trim(), extra.instructions].filter(Boolean).join("\n\n"),
      answerKey: [a.answerKey.trim(), extra.answerKey].filter(Boolean).join("\n"),
    };
  });
}
