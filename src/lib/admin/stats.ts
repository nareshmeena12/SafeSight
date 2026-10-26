/**
 * Shapes the admin functions' rows (S23) into what the pages show. Pure and
 * unit-tested; the numbers themselves come from SQL (aggregates only).
 */

import { formatWeekLabel } from "./weeks";

// ---------------------------------------------------------------- AI usage

export const featureGroups = [
  { key: "sage", label: "Sage tutoring", note: "Replies, labels, the output guard, notes search, photos" },
  { key: "learning", label: "Learning tools", note: "Practice, explain it back, recaps, exam prep" },
  { key: "teacher", label: "Teacher tools", note: "Lens, briefs, feedback drafts, viva questions, setup" },
  { key: "writing", label: "Writing (Trace)", note: "Evidence summaries" },
  { key: "notes", label: "Course notes", note: "Reading uploaded PDFs" },
  { key: "other", label: "Other", note: "Tests and anything new" },
] as const;

export type FeatureGroup = (typeof featureGroups)[number]["key"];

const learningFeatures = new Set([
  "practice_generate",
  "practice_grade",
  "practice_notes_search",
  "refresher_generate",
  "explain_back",
  "recap",
  "exam_topics",
  "exam_notes_search",
  "mock_generate",
  "mock_grade",
  "doubt_summary",
]);

const teacherFeatures = new Set([
  "lens",
  "lens_viva",
  "ai_resilience",
  "lecture_brief",
  "lecture_brief_quiz",
  "feedback_draft",
  "syllabus_extract",
  "assignment_suggest",
]);

export function featureGroup(feature: string): FeatureGroup {
  if (learningFeatures.has(feature)) return "learning";
  if (teacherFeatures.has(feature) || feature.startsWith("sage_preview")) return "teacher";
  if (feature === "sage_mistake") return "learning";
  if (feature.startsWith("sage_")) return "sage";
  if (feature.startsWith("trace_")) return "writing";
  if (feature.startsWith("notes_")) return "notes";
  return "other";
}

export type UsageRow = {
  week: string;
  feature: string;
  user_role: string;
  calls: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
};

export type UsageTotals = { calls: number; failed: number; tokens: number };

export type UsageSummary = {
  weeks: { week: string; label: string; tokens: number; calls: number }[];
  thisWeek: UsageTotals;
  lastWeek: UsageTotals;
  total: UsageTotals;
  byGroup: { key: FeatureGroup; label: string; note: string; calls: number; tokens: number; share: number }[];
  byRole: { role: "student" | "teacher" | "other"; calls: number; tokens: number }[];
};

const empty = (): UsageTotals => ({ calls: 0, failed: 0, tokens: 0 });

function add(t: UsageTotals, r: UsageRow) {
  t.calls += r.calls;
  t.failed += r.failed;
  t.tokens += Number(r.input_tokens) + Number(r.output_tokens);
}

/** `weeks` = the Mondays to show, oldest first (from `recentWeeks`). */
export function summariseUsage(rows: UsageRow[], weeks: string[]): UsageSummary {
  const perWeek = new Map(weeks.map((w) => [w, empty()]));
  const groups = new Map<FeatureGroup, UsageTotals>();
  const roles = new Map<"student" | "teacher" | "other", UsageTotals>();
  const total = empty();
  for (const r of rows) {
    const week = perWeek.get(r.week);
    if (!week) continue;
    add(week, r);
    add(total, r);
    const g = featureGroup(r.feature);
    if (!groups.has(g)) groups.set(g, empty());
    add(groups.get(g)!, r);
    const role = r.user_role === "student" ? "student" : r.user_role === "teacher" || r.user_role === "admin" ? "teacher" : "other";
    if (!roles.has(role)) roles.set(role, empty());
    add(roles.get(role)!, r);
  }
  const last = weeks.at(-1);
  const prev = weeks.at(-2);
  return {
    weeks: weeks.map((w) => {
      const t = perWeek.get(w)!;
      return { week: w, label: formatWeekLabel(w), tokens: t.tokens, calls: t.calls };
    }),
    thisWeek: last ? perWeek.get(last)! : empty(),
    lastWeek: prev ? perWeek.get(prev)! : empty(),
    total,
    byGroup: featureGroups
      .map((g) => {
        const t = groups.get(g.key) ?? empty();
        return { key: g.key, label: g.label, note: g.note, calls: t.calls, tokens: t.tokens, share: total.tokens ? t.tokens / total.tokens : 0 };
      })
      .filter((g) => g.calls > 0),
    byRole: (["student", "teacher", "other"] as const)
      .map((role) => ({ role, calls: roles.get(role)?.calls ?? 0, tokens: roles.get(role)?.tokens ?? 0 }))
      .filter((r) => r.calls > 0),
  };
}

/** 1234 → "1.2k", 2_500_000 → "2.5M". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${trim(n / 1000)}k`;
  return String(Math.round(n));
}

function trim(n: number) {
  return n.toFixed(1).replace(/\.0$/, "");
}

// ---------------------------------------------------------------- departments

export type DepartmentWeekRow = {
  week: string;
  department_id: string | null;
  students: number;
  active_students: number;
  scored_students: number;
  avg_reliance: number | null;
  high_reliance_share: number | null;
  sage_messages: number;
  practice_sets: number;
  explain_backs: number;
  mock_tests: number;
  doubts: number;
  avg_mastery: number | null;
};

export type DepartmentSummary = {
  id: string | null;
  name: string;
  students: number;
  /** Active this week ÷ enrolled. */
  activeThisWeek: number;
  activeShare: number;
  /** Latest week with a shown score (3+ students), else null. */
  reliance: number | null;
  highShare: number | null;
  relianceTrend: { label: string; value: number | null }[];
  activeTrend: { label: string; value: number | null }[];
  /** Last 4 weeks, summed. */
  signals: { sageMessages: number; practice: number; explainBacks: number; mockTests: number; doubts: number };
  /** Latest week with a shown mastery average, 0–1. */
  mastery: number | null;
};

/**
 * One summary per department (and "No department" for courses without one),
 * in the order of `departments`. Departments with no courses still appear,
 * with zeros, so the admin sees where nothing has started yet.
 */
export function summariseDepartments(
  rows: DepartmentWeekRow[],
  departments: { id: string; name: string }[],
  weeks: string[],
): DepartmentSummary[] {
  const byDept = new Map<string | null, DepartmentWeekRow[]>();
  for (const r of rows) {
    const list = byDept.get(r.department_id) ?? [];
    list.push(r);
    byDept.set(r.department_id, list);
  }
  const ids: (string | null)[] = departments.map((d) => d.id);
  if (byDept.has(null)) ids.push(null);
  const names = new Map(departments.map((d) => [d.id, d.name]));
  const last4 = new Set(weeks.slice(-4));
  const thisWeek = weeks.at(-1);

  return ids.map((id) => {
    const list = byDept.get(id) ?? [];
    const byWeek = new Map(list.map((r) => [r.week, r]));
    const latest = <K extends keyof DepartmentWeekRow>(key: K) => {
      for (const w of [...weeks].reverse()) {
        const v = byWeek.get(w)?.[key];
        if (v !== null && v !== undefined) return v as NonNullable<DepartmentWeekRow[K]>;
      }
      return null;
    };
    const students = list[0]?.students ?? 0;
    const active = thisWeek ? (byWeek.get(thisWeek)?.active_students ?? 0) : 0;
    const sum = (key: "sage_messages" | "practice_sets" | "explain_backs" | "mock_tests" | "doubts") =>
      list.filter((r) => last4.has(r.week)).reduce((n, r) => n + r[key], 0);
    const relianceRow = [...weeks].reverse().map((w) => byWeek.get(w)).find((r) => r && r.avg_reliance !== null);
    return {
      id,
      name: id === null ? "No department" : (names.get(id) ?? "Department"),
      students,
      activeThisWeek: active,
      activeShare: students ? active / students : 0,
      reliance: relianceRow ? Math.round(relianceRow.avg_reliance!) : null,
      highShare: relianceRow?.high_reliance_share ?? null,
      relianceTrend: weeks.map((w) => {
        const v = byWeek.get(w)?.avg_reliance;
        return { label: formatWeekLabel(w), value: v === null || v === undefined ? null : Math.round(v) };
      }),
      activeTrend: weeks.map((w) => ({ label: formatWeekLabel(w), value: byWeek.get(w)?.active_students ?? 0 })),
      signals: {
        sageMessages: sum("sage_messages"),
        practice: sum("practice_sets"),
        explainBacks: sum("explain_backs"),
        mockTests: sum("mock_tests"),
        doubts: sum("doubts"),
      },
      mastery: latest("avg_mastery"),
    };
  });
}

/** "62%" (rounded), or an en dash when there's nothing to show. */
export function percent(share: number | null): string {
  return share === null ? "–" : `${Math.round(share * 100)}%`;
}
