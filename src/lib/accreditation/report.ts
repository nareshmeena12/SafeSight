import {
  formatNumber,
  formatPct,
  formatValue,
  levelRule,
  mappingAverages,
  type AttainmentSettings,
  type CoResult,
  type EvidenceKind,
  type Mapping,
  type Outcome,
  type PoResult,
  type ProgramOutcome,
  type ProgramPoResult,
} from "./attainment";

/**
 * The accreditation reports (S24) as plain tables: the course report (COs,
 * CO–PO matrix, assessments, CO and PO attainment) and the programme report
 * (POs, PO attainment per course and for the programme). The PDF and the
 * Excel export both render this one model, so they always agree with each
 * other and with the page. Pure.
 */

export const DRAFT_NOTE = "Draft — verify against your university's format";

export type Cell = string | number | null;
export type Column = { header: string; width: number; align?: "left" | "right" | "center" };
export type ReportTable = {
  id: string;
  title: string;
  note?: string;
  columns: Column[];
  rows: Cell[][];
  /** Rows shown bold (e.g. the matrix's average row). */
  strongRows?: number[];
};
export type ReportDoc = {
  title: string;
  subtitle: string;
  meta: [string, string][];
  draftNote: string;
  tables: ReportTable[];
  method: string[];
  fileBase: string;
};

export const KIND_LABEL: Record<EvidenceKind, string> = {
  assignment: "Assignment",
  test: "Test / exam",
  practice: "Practice (self-study)",
  mock: "Mock tests (self-study)",
};

export function slug(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .slice(0, 60) || "report"
  );
}

function isoDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

function longDay(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function methodLines(s: AttainmentSettings): string[] {
  return [
    `Target: a student attains a CO in an assessment when they score at least ${formatNumber(s.targetPct)}% of the marks of the questions mapped to that CO. In a test, blank questions count as not attempted (left out of the maximum); absent students are left out.`,
    `Assignments: marks come from the teacher's approved feedback (points ÷ maximum over the rubric criteria with marks). Without marked feedback, the per-student number check counts: within tolerance = full marks, otherwise none.`,
    `Practice and mock tests are students' own self-study. Each student's mean score on items about a topic mapped to the CO is used; results from fewer than 3 students are not counted, so no one can be singled out. Weights: practice ${formatNumber(s.practiceWeight)}, mock tests ${formatNumber(s.mockWeight)}.`,
    `For each assessment: % of students = students who reached the target ÷ students assessed. For each CO: the weighted mean of those percentages (weights as listed).`,
    `Levels: ${[3, 2, 1, 0].map((l) => levelRule(l as 0 | 1 | 2 | 3, s)).join("; ")}. Target level: ${formatNumber(s.targetLevel)}.`,
    `PO attainment for the course: Σ(CO–PO mapping × CO level) ÷ Σ(mapping), over the COs mapped to the PO that were assessed. Mapping: 3 = high, 2 = medium, 1 = low.`,
    `Indirect assessment (course exit surveys) is not included.`,
  ];
}

// ---------------------------------------------------------------- course report

export type AssessmentSummary = { title: string; kind: EvidenceKind; outcomeCodes: string[]; weight: number; source: string };

export type CourseReportInput = {
  institution: string;
  course: { name: string; code: string };
  teacher: string;
  program: { name: string; department: string } | null;
  settings: AttainmentSettings;
  outcomes: Outcome[];
  programOutcomes: ProgramOutcome[];
  mappings: Mapping[];
  assessments: AssessmentSummary[];
  co: CoResult[];
  po: PoResult[];
  generatedAt: Date;
};

export function matrixTable(outcomes: Outcome[], programOutcomes: ProgramOutcome[], mappings: Mapping[]): ReportTable {
  const level = (co: string, po: string) => mappings.find((m) => m.outcomeId === co && m.programOutcomeId === po)?.level ?? null;
  const averages = mappingAverages(outcomes, mappings, programOutcomes);
  return {
    id: "matrix",
    title: "CO–PO mapping (course articulation matrix)",
    note: "3 = high, 2 = medium, 1 = low, – = not mapped. The last row is the mean of the filled cells.",
    columns: [{ header: "CO", width: 9 }, ...programOutcomes.map((p) => ({ header: p.code, width: 6.5, align: "center" as const }))],
    rows: [
      ...outcomes.map((o) => [o.code, ...programOutcomes.map((p) => level(o.id, p.id) ?? "–")]),
      ["Average", ...averages.map((a) => (a === null ? "–" : formatValue(a)))],
    ],
    strongRows: [outcomes.length],
  };
}

export function buildCourseReport(input: CourseReportInput): ReportDoc {
  const { course, settings: s } = input;
  const label = course.code ? `${course.code} — ${course.name}` : course.name;
  const tables: ReportTable[] = [
    {
      id: "outcomes",
      title: "Course outcomes",
      columns: [
        { header: "CO", width: 9 },
        { header: "Statement", width: 91 },
      ],
      rows: input.outcomes.map((o) => [o.code, o.description]),
    },
  ];
  if (input.programOutcomes.length) tables.push(matrixTable(input.outcomes, input.programOutcomes, input.mappings));
  tables.push({
    id: "assessments",
    title: "Assessments used",
    columns: [
      { header: "Assessment", width: 30 },
      { header: "Type", width: 16 },
      { header: "COs", width: 16 },
      { header: "Weight", width: 8, align: "right" },
      { header: "Marks from", width: 30 },
    ],
    rows: input.assessments.map((a) => [a.title, KIND_LABEL[a.kind], a.outcomeCodes.join(", ") || "None", formatNumber(a.weight), a.source]),
  });
  tables.push({
    id: "co-detail",
    title: "CO attainment by assessment",
    note: `Reached target = scored at least ${formatNumber(s.targetPct)}% of the marks mapped to the CO.`,
    columns: [
      { header: "CO", width: 7 },
      { header: "Assessment", width: 24 },
      { header: "Questions", width: 20 },
      { header: "Assessed", width: 9, align: "right" },
      { header: "Reached target", width: 10, align: "right" },
      { header: "% of students", width: 10, align: "right" },
      { header: "Weight", width: 7, align: "right" },
      { header: "Counted", width: 13 },
    ],
    rows: input.co.flatMap((c) =>
      c.rows.length
        ? c.rows.map((r) => [
            c.outcome.code,
            r.title,
            r.detail,
            r.assessed === null ? "< 3" : r.assessed,
            r.attained === null ? "—" : r.attained,
            formatPct(r.pct),
            formatNumber(r.weight),
            r.counted ? "Yes" : (r.note ?? "No"),
          ])
        : [[c.outcome.code, "Not assessed yet", "", "", "", "", "", ""]],
    ),
  });
  tables.push({
    id: "co",
    title: "CO attainment",
    columns: [
      { header: "CO", width: 7 },
      { header: "Attainment (% of students)", width: 13, align: "right" },
      { header: "Level (0–3)", width: 8, align: "right" },
      { header: "Target level", width: 8, align: "right" },
      { header: "Met", width: 6 },
      { header: "How it was computed", width: 58 },
    ],
    rows: input.co.map((c) => [
      c.outcome.code,
      formatPct(c.pct),
      c.level ?? "—",
      formatNumber(s.targetLevel),
      c.met === null ? "—" : c.met ? "Yes" : "No",
      c.formula,
    ]),
  });
  if (input.po.length) {
    tables.push({
      id: "po",
      title: "PO attainment from this course",
      note: "Σ(mapping × CO level) ÷ Σ(mapping), on the 0–3 scale.",
      columns: [
        { header: "PO", width: 8 },
        { header: "Outcome", width: 24 },
        { header: "Attainment (0–3)", width: 10, align: "right" },
        { header: "How it was computed", width: 58 },
      ],
      rows: input.po.map((p) => [p.outcome.code, p.outcome.title || p.outcome.description, formatValue(p.value), p.formula]),
    });
  }
  const meta: [string, string][] = [
    ["Institution", input.institution || "—"],
    ["Programme", input.program ? [input.program.name, input.program.department].filter(Boolean).join(", ") : "Not linked"],
    ["Course", label],
    ["Teacher", input.teacher || "—"],
  ];
  if (s.academicYear) meta.push(["Academic year", s.academicYear]);
  meta.push(["Prepared", `${longDay(input.generatedAt)} in SafeSight`]);
  return {
    title: "Course outcome attainment",
    subtitle: label,
    meta,
    draftNote: DRAFT_NOTE,
    tables,
    method: methodLines(s),
    fileBase: `CO-attainment-${slug(course.code || course.name)}-${isoDay(input.generatedAt)}`,
  };
}

// ---------------------------------------------------------------- programme report

export type ProgramCourseSummary = {
  label: string;
  teacher: string;
  academicYear: string;
  outcomes: number;
  assessed: number;
  met: number;
  values: Record<string, number | null>;
};

export type ProgramReportInput = {
  institution: string;
  program: { name: string; department: string };
  programOutcomes: ProgramOutcome[];
  courses: ProgramCourseSummary[];
  results: ProgramPoResult[];
  generatedAt: Date;
};

export function buildProgramReport(input: ProgramReportInput): ReportDoc {
  const pos = input.programOutcomes;
  const tables: ReportTable[] = [
    {
      id: "pos",
      title: "Programme outcomes",
      columns: [
        { header: "Code", width: 8 },
        { header: "Outcome", width: 24 },
        { header: "Statement", width: 68 },
      ],
      rows: pos.map((p) => [p.code, p.title, p.description]),
    },
    {
      id: "by-course",
      title: "PO attainment by course",
      note: "Each course's value is Σ(mapping × CO level) ÷ Σ(mapping) on the 0–3 scale; – = no value. The last row is the programme.",
      columns: [{ header: "Course", width: 22 }, ...pos.map((p) => ({ header: p.code, width: 6.5, align: "center" as const }))],
      rows: [
        ...input.courses.map((c) => [c.label, ...pos.map((p) => (c.values[p.id] == null ? "–" : formatValue(c.values[p.id])))]),
        ["Programme", ...input.results.map((r) => (r.value === null ? "–" : formatValue(r.value)))],
      ],
      strongRows: [input.courses.length],
    },
    {
      id: "program-po",
      title: "Programme PO attainment",
      columns: [
        { header: "PO", width: 8 },
        { header: "Outcome", width: 24 },
        { header: "Attainment (0–3)", width: 10, align: "right" },
        { header: "Courses", width: 8, align: "right" },
        { header: "How it was computed", width: 50 },
      ],
      rows: input.results.map((r) => [r.outcome.code, r.outcome.title || r.outcome.description, formatValue(r.value), r.courses, r.formula]),
    },
    {
      id: "courses",
      title: "Courses in this programme",
      columns: [
        { header: "Course", width: 30 },
        { header: "Teacher", width: 20 },
        { header: "Academic year", width: 14 },
        { header: "COs", width: 8, align: "right" },
        { header: "COs assessed", width: 12, align: "right" },
        { header: "COs at target", width: 12, align: "right" },
      ],
      rows: input.courses.map((c) => [c.label, c.teacher || "—", c.academicYear || "—", c.outcomes, c.assessed, c.met]),
    },
  ];
  const label = [input.program.name, input.program.department].filter(Boolean).join(", ");
  return {
    title: "Programme outcome attainment",
    subtitle: label,
    meta: [
      ["Institution", input.institution || "—"],
      ["Programme", input.program.name],
      ["Department", input.program.department || "—"],
      ["Courses", String(input.courses.length)],
      ["Prepared", `${longDay(input.generatedAt)} in SafeSight`],
    ],
    draftNote: DRAFT_NOTE,
    tables,
    method: [
      "Each course computes CO attainment from its assessments with its own thresholds (see each course report), then PO attainment as Σ(CO–PO mapping × CO level) ÷ Σ(mapping) over its assessed COs.",
      "Programme PO attainment is the mean of the course values for that PO; courses without a value for a PO are left out of its mean.",
      "Indirect assessment (exit surveys, employer feedback) is not included.",
    ],
    fileBase: `PO-attainment-${slug(input.program.name)}-${isoDay(input.generatedAt)}`,
  };
}
