import { describe, expect, it } from "vitest";
import { compactNumber, featureGroup, percent, summariseDepartments, summariseUsage, type DepartmentWeekRow } from "./stats";
import { formatWeekLabel, recentWeeks } from "./weeks";

describe("recentWeeks", () => {
  it("returns India-time Mondays, oldest first", () => {
    // Sunday 25 Oct 2026, 20:00 UTC = Monday 26 Oct, 01:30 IST.
    expect(recentWeeks(3, new Date("2026-10-25T20:00:00Z"))).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    // Sunday 25 Oct, 12:00 UTC is still Sunday in India.
    expect(recentWeeks(1, new Date("2026-10-25T12:00:00Z"))).toEqual(["2026-10-19"]);
  });

  it("labels weeks by their Monday", () => {
    expect(formatWeekLabel("2026-10-26")).toBe("26 Oct");
  });
});

describe("featureGroup", () => {
  it("sorts features into plain groups", () => {
    expect(featureGroup("sage_reply")).toBe("sage");
    expect(featureGroup("sage_photo")).toBe("sage");
    expect(featureGroup("sage_preview_reply")).toBe("teacher");
    expect(featureGroup("sage_mistake")).toBe("learning");
    expect(featureGroup("mock_grade")).toBe("learning");
    expect(featureGroup("lens")).toBe("teacher");
    expect(featureGroup("trace_summary")).toBe("writing");
    expect(featureGroup("notes_ingest")).toBe("notes");
    expect(featureGroup("eval_judge")).toBe("other");
  });
});

describe("summariseUsage", () => {
  const weeks = ["2026-10-19", "2026-10-26"];
  const row = (week: string, feature: string, role: string, calls: number, tokens: number, failed = 0) => ({
    week,
    feature,
    user_role: role,
    calls,
    failed,
    input_tokens: tokens / 2,
    output_tokens: tokens / 2,
  });

  it("totals by week, group and role", () => {
    const s = summariseUsage(
      [
        row("2026-10-19", "sage_reply", "student", 10, 1000),
        row("2026-10-26", "sage_reply", "student", 4, 400, 1),
        row("2026-10-26", "lens", "teacher", 2, 600),
        row("2026-10-26", "lens", "admin", 1, 100),
        row("2026-09-01", "lens", "teacher", 99, 99999), // outside the window
      ],
      weeks,
    );
    expect(s.total).toEqual({ calls: 17, failed: 1, tokens: 2100 });
    expect(s.thisWeek).toEqual({ calls: 7, failed: 1, tokens: 1100 });
    expect(s.lastWeek.tokens).toBe(1000);
    expect(s.weeks.map((w) => w.tokens)).toEqual([1000, 1100]);
    expect(s.byGroup.map((g) => [g.key, g.tokens])).toEqual([
      ["sage", 1400],
      ["teacher", 700],
    ]);
    expect(s.byGroup[0].share).toBeCloseTo(1400 / 2100);
    expect(s.byRole).toEqual([
      { role: "student", calls: 14, tokens: 1400 },
      { role: "teacher", calls: 3, tokens: 700 },
    ]);
  });

  it("handles no usage", () => {
    const s = summariseUsage([], weeks);
    expect(s.total.calls).toBe(0);
    expect(s.byGroup).toEqual([]);
  });
});

describe("summariseDepartments", () => {
  const weeks = ["2026-10-12", "2026-10-19", "2026-10-26"];
  const base: Omit<DepartmentWeekRow, "week" | "department_id"> = {
    students: 30,
    active_students: 0,
    scored_students: 0,
    avg_reliance: null,
    high_reliance_share: null,
    sage_messages: 0,
    practice_sets: 0,
    explain_backs: 0,
    mock_tests: 0,
    doubts: 0,
    avg_mastery: null,
  };

  it("summarises each department, keeps empty ones and adds courses without one", () => {
    const rows: DepartmentWeekRow[] = [
      { ...base, week: "2026-10-12", department_id: "me", avg_reliance: 40.4, high_reliance_share: 0.1, sage_messages: 5 },
      { ...base, week: "2026-10-19", department_id: "me", avg_reliance: 44.6, high_reliance_share: 0.2, sage_messages: 7, avg_mastery: 0.5 },
      { ...base, week: "2026-10-26", department_id: "me", active_students: 12, sage_messages: 3, practice_sets: 2 },
      { ...base, week: "2026-10-26", department_id: null, students: 4, active_students: 1 },
    ];
    const out = summariseDepartments(rows, [
      { id: "me", name: "Mechanical" },
      { id: "ce", name: "Civil" },
    ], weeks);
    expect(out.map((d) => d.name)).toEqual(["Mechanical", "Civil", "No department"]);
    const me = out[0];
    expect(me).toMatchObject({ students: 30, activeThisWeek: 12, reliance: 45, highShare: 0.2, mastery: 0.5 });
    expect(me.activeShare).toBeCloseTo(0.4);
    expect(me.relianceTrend.map((p) => p.value)).toEqual([40, 45, null]);
    expect(me.signals).toEqual({ sageMessages: 15, practice: 2, explainBacks: 0, mockTests: 0, doubts: 0 });
    expect(out[1]).toMatchObject({ students: 0, reliance: null, activeShare: 0 });
  });
});

describe("formatting", () => {
  it("shortens big numbers", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(1234)).toBe("1.2k");
    expect(compactNumber(48_900)).toBe("49k");
    expect(compactNumber(2_500_000)).toBe("2.5M");
  });

  it("shows shares as percentages", () => {
    expect(percent(0.416)).toBe("42%");
    expect(percent(null)).toBe("–");
  });
});
