import type { AiMode } from "@/components/product/mode-badge";

/**
 * Assignments a message can match, and a lexical similarity score that backs
 * up the classifier's own match. Pure: the route loads the assignments.
 */

export type AssignmentKind = "problem" | "essay" | "code";

export type SageAssignment = {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  mode: AiMode;
  kind: AssignmentKind;
  /** Highest ladder step Sage may unlock (1–4). */
  maxHintLevel: number;
  workedExamples: boolean;
  dueAt: string | null;
  /** Teacher-only. Never sent to the browser or quoted. */
  teacherNotes: string;
  /** Teacher-only. Never sent to the browser or quoted. */
  answerKey: string;
};

/** A message governs by an assignment at or above this similarity. */
export const MATCH_THRESHOLD = 0.55;

/** Assignments count as active until 14 days after they were due. */
export const ACTIVE_AFTER_DUE_MS = 14 * 24 * 60 * 60 * 1000;

export function isActive(a: Pick<SageAssignment, "dueAt">, now = Date.now()) {
  return !a.dueAt || new Date(a.dueAt).getTime() + ACTIVE_AFTER_DUE_MS > now;
}

/** What the student hands in, guessed from the title and instructions. */
export function assignmentKind(title: string, instructions: string): AssignmentKind {
  const t = `${title}\n${instructions}`.toLowerCase();
  if (/\b(python|java\b|c\+\+|javascript|matlab|program|function|code|script|implement|def |class |algorithm in)\b/.test(t)) {
    return "code";
  }
  if (/\b(essay|report|reflection|write[- ]up|in \d{2,4}\s*[–-]?\s*\d{0,4}\s*words|\d{3,4} words|paragraphs?|discuss|critically)\b/.test(t)) {
    return "essay";
  }
  return "problem";
}

const STOP = new Set(
  `a an the and or but if then than so of to in on at by for with from into onto over under about as is are was were be been being it its this that these those there here
  i me my we our you your he she they them their what which who whom whose why how when where can could should would will shall may might must do does did done
  have has had not no yes please help explain tell show give get got just only also very much more most some any each every all both few many such own same other
  find calculate determine compute solve answer question problem part step using use used one two`.split(/\s+/),
);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}

/** Numbers that identify a specific problem: decimals, 3+ digits, or with a unit right after. */
export function significantNumbers(text: string): string[] {
  const out = new Set<string>();
  const plain = text.replace(/(\d),(\d{3})\b/g, "$1$2");
  for (const m of plain.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)(\s*(?:k?pa|mpa|bar|kg|g|m³|m3|m\^3|°c|k\b|kj|j\b|kw|w\b|m\/s|n\b|kn|l\b|mm|cm|m\b|%|s\b|mol|v\b|a\b|Ω|hz))?/gi)) {
    const n = m[1];
    const hasUnit = Boolean(m[2]?.trim());
    if (n.includes(".") || n.replace("-", "").length >= 3 || hasUnit) out.add(String(Number(n)));
  }
  return [...out];
}

function shingles(ws: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(" "));
  return out;
}

/**
 * How closely a message is about this assignment's own task (0–1), from words
 * and numbers alone. A pasted question scores ~1; "what is entropy?" in an
 * essay about entropy scores low (one shared word is a topic, not the task).
 */
export function lexicalSimilarity(message: string, assignment: Pick<SageAssignment, "title" | "instructions">): number {
  const source = `${assignment.title}\n${assignment.instructions}`;
  const mWords = words(message);
  const aWords = words(source);
  if (!mWords.length || !aWords.length) return 0;

  const aSet = new Set(aWords);
  const shared = new Set(mWords.filter((w) => aSet.has(w)));
  const unique = new Set(mWords);
  const containment = shared.size / unique.size;
  const wordScore = containment * Math.min(1, unique.size / 8) * 0.9;

  const aNums = new Set(significantNumbers(source));
  const sharedNums = significantNumbers(message).filter((n) => aNums.has(n)).length;
  const numScore = Math.min(1, sharedNums * 0.35);

  const aShingles = shingles(aWords, 5);
  const verbatim = [...shingles(mWords, 5)].some((s) => aShingles.has(s)) ? 0.95 : 0;

  // Naming the assignment ("the mid-semester test", "lab 4 newton raphson") means it's about it.
  // A number in the title must follow the same word ("set 3", "lab 4"), so set 2 ≠ set 3.
  const titleWords = [...new Set(words(assignment.title))];
  const numbered = [...assignment.title.toLowerCase().matchAll(/([a-z]+)\W{0,3}(\d+)\b/g)];
  const named =
    titleWords.length + numbered.length >= 2 &&
    titleWords.every((w) => unique.has(w)) &&
    numbered.every(([, w, n]) => new RegExp(`\\b${w}\\W{0,3}${n}\\b`, "i").test(message))
      ? 0.7
      : 0;

  return round(Math.max(wordScore, numScore, verbatim, named));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** The candidate list shown to the classifier, with short refs ("A1", …). */
export function candidateRefs(assignments: SageAssignment[]) {
  return assignments.map((a, i) => ({ ref: `A${i + 1}`, assignment: a }));
}

/**
 * Combine the classifier's match with the lexical one: the higher similarity
 * wins, so a classifier that missed a pasted question doesn't open a loophole.
 */
export function bestMatch(
  message: string,
  assignments: SageAssignment[],
  model: { ref: string | null; similarity: number } | null,
): { assignmentId: string | null; similarity: number } {
  let best: { assignmentId: string | null; similarity: number } = { assignmentId: null, similarity: 0 };
  const refs = candidateRefs(assignments);
  if (model?.ref) {
    const hit = refs.find((r) => r.ref === model.ref);
    if (hit) best = { assignmentId: hit.assignment.id, similarity: round(model.similarity) };
  }
  for (const { assignment } of refs) {
    const s = lexicalSimilarity(message, assignment);
    if (s > best.similarity) best = { assignmentId: assignment.id, similarity: s };
  }
  return best;
}
