import { z } from "zod";
import { normaliseRoll, splitCsv } from "@/lib/setup/roster";

/**
 * Tests and exams for CO attainment (S24): the question list and the
 * question-wise marks a teacher imports from a spreadsheet. Pure, so the
 * browser preview and the server import read a file the same way.
 *
 * The file needs a header row: a roll number (or USN, Reg. no.) or email
 * column, optionally a name, and one column per question named like the
 * question ("Q1", "Q1a", "1b"). A blank cell means not attempted; "AB"
 * marks the student absent.
 */

export const MAX_QUESTIONS = 40;
export const MAX_MARK_ROWS = 600;

const ROLL = /^[A-Z0-9/-]{1,32}$/;

export const questionSchema = z.object({
  id: z.uuid().optional(),
  label: z
    .string()
    .trim()
    .min(1, "Every question needs a label (Q1, Q2a …).")
    .max(16, "Keep question labels under 16 characters."),
  maxMarks: z.coerce.number().positive("Marks out of must be more than 0.").max(1000, "Marks out of can be at most 1000."),
  outcomeIds: z.array(z.uuid()).max(20),
});
export type QuestionInput = z.infer<typeof questionSchema>;

export const questionsSchema = z
  .array(questionSchema)
  .min(1, "Add at least one question.")
  .max(MAX_QUESTIONS, `Keep a test to ${MAX_QUESTIONS} questions.`)
  .superRefine((qs, ctx) => {
    const seen = new Set<string>();
    for (const q of qs) {
      const key = labelKey(q.label);
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: `Question ${q.label} appears twice.` });
      seen.add(key);
    }
  });

/** "Q 1(a)", "q1a", "1a" → "1a": how a header cell is matched to a question. */
export function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/^\s*(question|ques|que|qn|q)\.?\s*(no\.?)?\s*/i, "")
    .replace(/[^a-z0-9]/g, "");
}

/** "Q1, Q2a, Q2b" or "Q1-Q5" → question labels (used to start a test quickly). */
export function expandLabels(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n;]+/).map((p) => p.trim()).filter(Boolean)) {
    const range = part.match(/^(q?)(\d{1,2})\s*[-–to]+\s*q?(\d{1,2})$/i);
    if (range) {
      const [from, to] = [Number(range[2]), Number(range[3])];
      if (to >= from && to - from < MAX_QUESTIONS) for (let n = from; n <= to; n++) out.push(`Q${n}`);
    } else out.push(part.slice(0, 16));
  }
  return [...new Set(out)].slice(0, MAX_QUESTIONS);
}

export type MarksRow = {
  line: number;
  rollNumber: string | null;
  email: string | null;
  name: string;
  /** Per question, in question order; null = not attempted. */
  marks: (number | null)[];
  absent: boolean;
};
export type MarksIssue = { line: number; message: string };
export type ParsedMarks = { rows: MarksRow[]; errors: MarksIssue[]; warnings: MarksIssue[]; matchedQuestions: string[] };

type IdColumn = "roll" | "email" | "name" | "first" | "last";

function idColumn(cell: string): IdColumn | null {
  const h = cell.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (h.includes("email") || h === "mail" || h === "e mail" || h === "mail id") return "email";
  if (/^(first name|given name|first)$/.test(h)) return "first";
  if (/^(last name|surname|family name|last)$/.test(h)) return "last";
  if (/\b(roll|usn|reg|registration|enrol+ment|admission|prn|student id|id no|seat)\b/.test(h)) return "roll";
  if (/\bname\b/.test(h) || h === "student") return "name";
  return null;
}

const ABSENT = /^(ab|a|abs|absent|aa)$/i;
const SKIP = /^(-|–|—|na|n\/a|nil)$/i;

/** The row key stored with the marks: the roll number, else the email. */
export function rowKey(row: Pick<MarksRow, "rollNumber" | "email">): string | null {
  return row.rollNumber ?? row.email ?? null;
}

/**
 * Reads question-wise marks. Rows with a mark above the question's maximum,
 * a negative or unreadable mark, or no roll number / email are errors (not
 * imported); unknown columns and duplicate students are warnings.
 */
export function parseMarks(text: string, questions: Pick<QuestionInput, "label" | "maxMarks">[]): ParsedMarks {
  const records = splitCsv(text);
  const errors: MarksIssue[] = [];
  const warnings: MarksIssue[] = [];
  if (!records.length) return { rows: [], errors: [{ line: 1, message: "The file is empty." }], warnings, matchedQuestions: [] };

  const header = records[0];
  const qIndex = new Map(questions.map((q, i) => [labelKey(q.label), i]));
  const cols = header.cells.map((cell) => {
    const id = idColumn(cell);
    if (id) return { kind: "id" as const, id };
    const key = labelKey(cell);
    const q = qIndex.get(key);
    if (q !== undefined) return { kind: "question" as const, q };
    if (/^(total|marks|score|grand total|out of)$/i.test(cell.trim()) || /^s\.?\s*no\.?$|^sr\.?\s*no\.?$|^serial/i.test(cell.trim())) {
      return { kind: "ignore" as const };
    }
    return { kind: "unknown" as const, cell };
  });
  const hasId = cols.some((c) => c.kind === "id" && (c.id === "roll" || c.id === "email"));
  const matched = new Set(cols.flatMap((c) => (c.kind === "question" ? [c.q] : [])));
  if (!hasId || !matched.size) {
    return {
      rows: [],
      errors: [
        {
          line: header.line,
          message: !hasId
            ? "The first row needs column names, with a roll number (or email) column. Download the template to see the layout."
            : `No column matches a question of this test (${questions.map((q) => q.label).join(", ")}).`,
        },
      ],
      warnings,
      matchedQuestions: [],
    };
  }
  const unknown = cols.flatMap((c) => (c.kind === "unknown" && c.cell ? [c.cell] : []));
  if (unknown.length) warnings.push({ line: header.line, message: `Ignored columns: ${unknown.join(", ")}.` });
  const missing = questions.filter((_, i) => !matched.has(i)).map((q) => q.label);
  if (missing.length) warnings.push({ line: header.line, message: `No column for ${missing.join(", ")}: those count as not attempted.` });

  const rows: MarksRow[] = [];
  const seen = new Set<string>();
  for (const rec of records.slice(1)) {
    if (rows.length >= MAX_MARK_ROWS) {
      errors.push({ line: rec.line, message: `Only the first ${MAX_MARK_ROWS} students are imported.` });
      break;
    }
    let roll: string | null = null;
    let email: string | null = null;
    const name: string[] = [];
    const marks: (number | null)[] = questions.map(() => null);
    let absentCells = 0;
    let markCells = 0;
    let problem: string | null = null;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const cell = (rec.cells[i] ?? "").trim();
      if (col.kind === "id") {
        if (!cell) continue;
        if (col.id === "roll") roll = normaliseRoll(cell);
        else if (col.id === "email") email = cell.toLowerCase();
        else name.push(cell);
      } else if (col.kind === "question") {
        if (!cell || SKIP.test(cell)) continue;
        if (ABSENT.test(cell)) {
          absentCells++;
          continue;
        }
        const value = Number(cell.replace(",", "."));
        const q = questions[col.q];
        if (!Number.isFinite(value)) problem ??= `${q.label} has "${cell}", which isn't a number.`;
        else if (value < 0) problem ??= `${q.label} has a negative mark.`;
        else if (value > q.maxMarks + 1e-9) problem ??= `${q.label} has ${cell}, but it is out of ${q.maxMarks}.`;
        else {
          marks[col.q] = value;
          markCells++;
        }
      }
    }
    if (roll !== null && !ROLL.test(roll)) {
      problem ??= `Roll number "${roll}" has characters a roll number can't have.`;
    }
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (roll === null) problem ??= `"${email}" isn't an email address.`;
      email = null;
    }
    if (roll === null && email === null) problem ??= "No roll number or email on this row.";
    if (problem) {
      errors.push({ line: rec.line, message: problem });
      continue;
    }
    const row: MarksRow = {
      line: rec.line,
      rollNumber: roll,
      email,
      name: name.join(" ").slice(0, 120),
      marks,
      absent: markCells === 0 && absentCells > 0,
    };
    const key = rowKey(row)!;
    if (seen.has(key)) {
      warnings.push({ line: rec.line, message: `${key} appears again: this later row is used.` });
      const at = rows.findIndex((r) => rowKey(r) === key);
      rows.splice(at, 1);
    }
    seen.add(key);
    rows.push(row);
  }
  if (!rows.length && !errors.length) errors.push({ line: header.line, message: "There are no students under the header row." });
  return { rows, errors, warnings, matchedQuestions: [...matched].sort((a, b) => a - b).map((i) => questions[i].label) };
}

/** A template with one row per enrolled student, for the teacher to fill in. */
export function marksTemplate(questions: { label: string }[], students: { rollNumber: string | null; email: string; name: string }[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Roll number", "Email", "Name", ...questions.map((q) => q.label)];
  const lines = students.map((s) => [s.rollNumber ?? "", s.email, s.name, ...questions.map(() => "")].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\n");
}

/** Stored marks (jsonb, keyed by question id). */
export const storedMarksSchema = z.record(z.string(), z.number().nullable()).catch({});

/** Stored marks in the order of the test's questions (null = not attempted). */
export function marksInOrder(stored: unknown, questions: { id: string }[]): (number | null)[] {
  const marks = storedMarksSchema.parse(stored);
  return questions.map((q) => marks[q.id] ?? null);
}
