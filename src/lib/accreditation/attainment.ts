import { relatedTopics } from "@/lib/learning/topics";

/**
 * CO and PO attainment (S24), the way NBA / NAAC self-assessment reports
 * compute it. Pure, so every number on the page and in the exports comes from
 * one place and can be shown with the sum that produced it:
 *
 * 1. In each assessment, a student attains a CO when they score at least
 *    `targetPct` % of the marks of the questions mapped to it.
 * 2. Per assessment and CO: % of assessed students who attained it.
 * 3. Per CO: the weighted mean of those percentages over its assessments,
 *    turned into a level (3 / 2 / 1 / 0) with the level thresholds.
 * 4. Per PO (one course): Σ(mapping × CO level) ÷ Σ mapping over the COs
 *    mapped to it that were assessed.
 * 5. Per PO (programme): the mean of the course values.
 */

export type AttainmentSettings = {
  targetPct: number;
  level1Pct: number;
  level2Pct: number;
  level3Pct: number;
  targetLevel: number;
  practiceWeight: number;
  mockWeight: number;
  academicYear: string;
};

export const DEFAULT_SETTINGS: AttainmentSettings = {
  targetPct: 60,
  level1Pct: 50,
  level2Pct: 60,
  level3Pct: 70,
  targetLevel: 2,
  practiceWeight: 0.5,
  mockWeight: 0.5,
  academicYear: "",
};

/** Self-study results (students' own practice and mock tests) need this many students, so no one can be singled out. */
export const SELF_STUDY_MIN_STUDENTS = 3;

export type Outcome = { id: string; code: string; description: string };
export type ProgramOutcome = { id: string; code: string; title: string; description: string; kind: "po" | "pso" };
export type Mapping = { outcomeId: string; programOutcomeId: string; level: number; justification?: string };

export type EvidenceKind = "assignment" | "test" | "practice" | "mock";

/** One student's share of the marks (0–1) for one CO in one assessment. */
export type StudentScore = { student: string; score: number };

/** An assessment's results per CO, before any threshold is applied. */
export type Evidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  weight: number;
  /** Where the marks come from, in a sentence. */
  source: string;
  byOutcome: Record<string, { scores: StudentScore[]; detail: string }>;
  minStudents: number;
};

export type AssessmentRow = {
  assessmentId: string;
  kind: EvidenceKind;
  title: string;
  weight: number;
  detail: string;
  /** Null when hidden (too few students for self-study). */
  assessed: number | null;
  attained: number | null;
  pct: number | null;
  counted: boolean;
  note: string | null;
};

export type Level = 0 | 1 | 2 | 3;

export type CoResult = {
  outcome: Outcome;
  rows: AssessmentRow[];
  pct: number | null;
  level: Level | null;
  met: boolean | null;
  formula: string;
};

export type PoTerm = { coCode: string; mapping: number; level: Level | null };

export type PoResult = {
  outcome: ProgramOutcome;
  value: number | null;
  terms: PoTerm[];
  formula: string;
};

// ---------------------------------------------------------------- formatting

export function round(value: number, digits: number) {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function formatPct(value: number | null) {
  return value === null ? "—" : `${round(value, 1).toFixed(1)}%`;
}

export function formatValue(value: number | null) {
  return value === null ? "—" : round(value, 2).toFixed(2);
}

/** Weights and marks: no trailing zeros ("0.5", "1", "12.5"). */
export function formatNumber(value: number) {
  return String(round(value, 2));
}

// ---------------------------------------------------------------- 1–3: CO attainment

/** The level a % of students reaches. */
export function levelFor(pct: number, s: Pick<AttainmentSettings, "level1Pct" | "level2Pct" | "level3Pct">): Level {
  const eps = 1e-9;
  if (pct + eps >= s.level3Pct) return 3;
  if (pct + eps >= s.level2Pct) return 2;
  if (pct + eps >= s.level1Pct) return 1;
  return 0;
}

export function levelRule(level: Level, s: AttainmentSettings) {
  if (level === 0) return `Level 0: fewer than ${formatNumber(s.level1Pct)}% of students reached ${formatNumber(s.targetPct)}% of the marks`;
  const at = level === 3 ? s.level3Pct : level === 2 ? s.level2Pct : s.level1Pct;
  return `Level ${level}: at least ${formatNumber(at)}% of students reached ${formatNumber(s.targetPct)}% of the marks`;
}

/** Per CO, every assessment that covers it, the weighted %, the level and the sum that produced it. */
export function coAttainment(outcomes: Outcome[], evidence: Evidence[], settings: AttainmentSettings): CoResult[] {
  const eps = 1e-9;
  return outcomes.map((outcome) => {
    const rows: AssessmentRow[] = [];
    for (const e of evidence) {
      const part = e.byOutcome[outcome.id];
      if (!part) continue;
      const assessed = part.scores.length;
      const attained = part.scores.filter((s) => s.score * 100 + eps >= settings.targetPct).length;
      const tooFew = assessed < e.minStudents;
      const pct = assessed && !tooFew ? (attained / assessed) * 100 : null;
      let note: string | null = null;
      if (!assessed) note = "No results yet";
      else if (tooFew) note = `Fewer than ${e.minStudents} students — not counted, so no one can be singled out`;
      else if (e.weight <= 0) note = "Weight 0 — shown, not counted";
      rows.push({
        assessmentId: e.id,
        kind: e.kind,
        title: e.title,
        weight: e.weight,
        detail: part.detail,
        assessed: tooFew && assessed ? null : assessed,
        attained: tooFew ? null : attained,
        pct,
        counted: pct !== null && e.weight > 0,
        note,
      });
    }
    const counted = rows.filter((r) => r.counted);
    if (!counted.length) {
      return {
        outcome,
        rows,
        pct: null,
        level: null,
        met: null,
        formula: rows.length ? "Not assessed yet: none of its assessments has results that count." : "Not assessed yet: no assessment is mapped to it.",
      };
    }
    const weightSum = counted.reduce((n, r) => n + r.weight, 0);
    const pct = counted.reduce((n, r) => n + r.weight * r.pct!, 0) / weightSum;
    const level = levelFor(pct, settings);
    const formula =
      counted.length === 1 && counted[0].weight === 1
        ? `${formatPct(counted[0].pct)} of students reached the target → ${levelRule(level, settings)}.`
        : `(${counted.map((r) => `${formatNumber(r.weight)} × ${formatPct(r.pct)}`).join(" + ")}) ÷ ${formatNumber(weightSum)} = ${formatPct(pct)} → ${levelRule(level, settings)}.`;
    return { outcome, rows, pct, level, met: level >= settings.targetLevel, formula };
  });
}

// ---------------------------------------------------------------- 4: PO attainment (course)

/** Per PO: Σ(mapping × CO level) ÷ Σ mapping over the assessed COs mapped to it. */
export function poAttainment(results: CoResult[], mappings: Mapping[], programOutcomes: ProgramOutcome[]): PoResult[] {
  const byId = new Map(results.map((r) => [r.outcome.id, r]));
  return programOutcomes.map((po) => {
    const terms: PoTerm[] = [];
    for (const r of results) {
      const m = mappings.find((x) => x.outcomeId === r.outcome.id && x.programOutcomeId === po.id);
      if (m && m.level > 0) terms.push({ coCode: r.outcome.code, mapping: m.level, level: byId.get(r.outcome.id)?.level ?? null });
    }
    const assessed = terms.filter((t) => t.level !== null);
    const skipped = terms.filter((t) => t.level === null).map((t) => t.coCode);
    if (!terms.length) return { outcome: po, value: null, terms, formula: "No course outcome is mapped to it." };
    if (!assessed.length) {
      return { outcome: po, value: null, terms, formula: `Mapped from ${terms.map((t) => t.coCode).join(", ")}, not assessed yet.` };
    }
    const top = assessed.reduce((n, t) => n + t.mapping * t.level!, 0);
    const bottom = assessed.reduce((n, t) => n + t.mapping, 0);
    const value = top / bottom;
    const sum = `(${assessed.map((t) => `${t.mapping} × ${t.level}`).join(" + ")}) ÷ (${assessed.map((t) => t.mapping).join(" + ")}) = ${formatValue(value)}`;
    const left = skipped.length ? ` ${skipped.join(", ")} not assessed yet, left out.` : "";
    return { outcome: po, value, terms, formula: `${sum} (mapping × CO level, over ${assessed.map((t) => t.coCode).join(", ")}).${left}` };
  });
}

/** The "average" row of a CO–PO matrix: the mean of the filled cells per PO. */
export function mappingAverages(outcomes: Outcome[], mappings: Mapping[], programOutcomes: ProgramOutcome[]) {
  const ids = new Set(outcomes.map((o) => o.id));
  return programOutcomes.map((po) => {
    const levels = mappings.filter((m) => m.programOutcomeId === po.id && ids.has(m.outcomeId) && m.level > 0).map((m) => m.level);
    return levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
  });
}

// ---------------------------------------------------------------- 5: PO attainment (programme)

export type CoursePoValues = { courseId: string; label: string; values: Record<string, number | null> };
export type ProgramPoResult = { outcome: ProgramOutcome; value: number | null; courses: number; formula: string };

/** Per PO: the mean of the courses' PO values (courses with no value are left out). */
export function programAttainment(programOutcomes: ProgramOutcome[], courses: CoursePoValues[]): ProgramPoResult[] {
  return programOutcomes.map((po) => {
    const parts = courses.flatMap((c) => {
      const v = c.values[po.id];
      return v === null || v === undefined ? [] : [{ label: c.label, value: v }];
    });
    if (!parts.length) return { outcome: po, value: null, courses: 0, formula: "No course has a value for it yet." };
    const value = parts.reduce((n, p) => n + p.value, 0) / parts.length;
    const formula =
      parts.length === 1
        ? `${formatValue(value)} from ${parts[0].label} (the only course with a value).`
        : `(${parts.map((p) => formatValue(p.value)).join(" + ")}) ÷ ${parts.length} = ${formatValue(value)} (mean over ${parts.map((p) => p.label).join(", ")}).`;
    return { outcome: po, value, courses: parts.length, formula };
  });
}

// ---------------------------------------------------------------- evidence builders

export type TestQuestion = { label: string; maxMarks: number; outcomeIds: string[] };
export type TestMarksRow = { student: string; marks: (number | null)[]; absent: boolean };

function list(labels: string[]) {
  return labels.length <= 6 ? labels.join(", ") : `${labels.slice(0, 6).join(", ")} and ${labels.length - 6} more`;
}

/**
 * A test's scores per CO: for each student who attempted at least one question
 * mapped to the CO, marks scored ÷ marks of the questions they attempted
 * (blank = not attempted, as in "answer any five"). Absent students are left out.
 */
export function testScoresByOutcome(questions: TestQuestion[], rows: TestMarksRow[]): Evidence["byOutcome"] {
  const out: Evidence["byOutcome"] = {};
  const outcomeIds = [...new Set(questions.flatMap((q) => q.outcomeIds))];
  for (const co of outcomeIds) {
    const qs = questions.map((q, i) => ({ ...q, i })).filter((q) => q.outcomeIds.includes(co));
    const scores: StudentScore[] = [];
    for (const row of rows) {
      if (row.absent) continue;
      let got = 0;
      let max = 0;
      for (const q of qs) {
        const m = row.marks[q.i];
        if (m === null || m === undefined || !Number.isFinite(m)) continue;
        got += Math.min(Math.max(m, 0), q.maxMarks);
        max += q.maxMarks;
      }
      if (max > 0) scores.push({ student: row.student, score: got / max });
    }
    const total = qs.reduce((n, q) => n + q.maxMarks, 0);
    out[co] = { scores, detail: `${list(qs.map((q) => q.label))} (${formatNumber(total)} ${total === 1 ? "mark" : "marks"})` };
  }
  return out;
}

export type FeedbackCriterion = { maxPoints: number | null; points: number | null };
export type AssignmentResult = {
  student: string;
  /** Approved feedback's criteria (null when there is none). */
  feedback: FeedbackCriterion[] | null;
  /** The per-student number auto-check on submitted work (null when none). */
  numbers: "within" | "outside" | "unreadable" | null;
};

/**
 * Each student's score on an assignment: points ÷ maximum over the criteria of
 * their approved feedback that carry both; otherwise the per-student number
 * check (within tolerance = full marks, anything else = none).
 */
export function assignmentScores(results: AssignmentResult[]) {
  const scores: StudentScore[] = [];
  let fromFeedback = 0;
  let fromNumbers = 0;
  for (const r of results) {
    const marked = (r.feedback ?? []).filter((c) => c.maxPoints && c.maxPoints > 0 && c.points !== null);
    const max = marked.reduce((n, c) => n + c.maxPoints!, 0);
    if (max > 0) {
      const got = marked.reduce((n, c) => n + Math.min(Math.max(c.points!, 0), c.maxPoints!), 0);
      scores.push({ student: r.student, score: got / max });
      fromFeedback++;
    } else if (r.numbers) {
      scores.push({ student: r.student, score: r.numbers === "within" ? 1 : 0 });
      fromNumbers++;
    }
  }
  return { scores, fromFeedback, fromNumbers };
}

export type SelfStudyItem = { student: string; topic: string; score: number };
export type TopicOutcome = { topic: string; outcomeId: string };

/**
 * Students' own practice or mock-test items per CO: the items on a topic
 * mapped to the CO (or a closely related label), averaged per student.
 */
export function selfStudyScoresByOutcome(items: SelfStudyItem[], topics: TopicOutcome[]): Evidence["byOutcome"] {
  const out: Evidence["byOutcome"] = {};
  const outcomeIds = [...new Set(topics.map((t) => t.outcomeId))];
  for (const co of outcomeIds) {
    const labels = topics.filter((t) => t.outcomeId === co).map((t) => t.topic);
    const per = new Map<string, { sum: number; n: number }>();
    for (const item of items) {
      if (!labels.some((l) => relatedTopics(l, item.topic))) continue;
      const p = per.get(item.student) ?? { sum: 0, n: 0 };
      p.sum += Math.min(Math.max(item.score, 0), 1);
      p.n++;
      per.set(item.student, p);
    }
    out[co] = {
      scores: [...per].map(([student, p]) => ({ student, score: p.sum / p.n })),
      detail: `Topics: ${list(labels)}`,
    };
  }
  return out;
}
