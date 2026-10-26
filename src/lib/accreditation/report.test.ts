import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { coAttainment, DEFAULT_SETTINGS, poAttainment, programAttainment, type ProgramOutcome } from "./attainment";
import { renderReportPdf } from "./pdf";
import { buildCourseReport, buildProgramReport, DRAFT_NOTE } from "./report";
import { renderReportXlsx } from "./xlsx";
import ExcelJS from "exceljs";
import { usesBannedWords } from "@/lib/trace/summary";

const outcomes = [
  { id: "co1", code: "CO1", description: "Apply the first law to closed systems" },
  { id: "co2", code: "CO2", description: "Evaluate entropy change ≥ zero" },
];
const pos: ProgramOutcome[] = [
  { id: "po1", code: "PO1", title: "Engineering knowledge", description: "…", kind: "po" },
  { id: "pso1", code: "PSO1", title: "", description: "Thermal systems", kind: "pso" },
];
const mappings = [
  { outcomeId: "co1", programOutcomeId: "po1", level: 3 },
  { outcomeId: "co2", programOutcomeId: "po1", level: 2 },
];

function courseDoc() {
  const evidence = [
    {
      id: "t1",
      kind: "test" as const,
      title: "Mid-semester test 1",
      weight: 1,
      source: "Marks you imported: 4 students",
      byOutcome: {
        co1: { scores: [0.9, 0.7, 0.4, 0.8].map((score, i) => ({ student: `s${i}`, score })), detail: "Q1 (10 marks)" },
      },
      minStudents: 1,
    },
  ];
  const co = coAttainment(outcomes, evidence, DEFAULT_SETTINGS);
  const po = poAttainment(co, mappings, pos);
  return buildCourseReport({
    institution: "Shivalik Institute of Technology, Mandi",
    course: { name: "Thermodynamics", code: "ME201" },
    teacher: "Kavita Sharma",
    program: { name: "B.Tech Mechanical Engineering", department: "Mechanical" },
    settings: { ...DEFAULT_SETTINGS, academicYear: "2026–27" },
    outcomes,
    programOutcomes: pos,
    mappings,
    assessments: [{ title: "Mid-semester test 1", kind: "test", outcomeCodes: ["CO1"], weight: 1, source: "Marks you imported: 4 students" }],
    co,
    po,
    generatedAt: new Date("2026-10-26T06:00:00Z"),
  });
}

describe("buildCourseReport", () => {
  it("lays out the standard tables with the draft note and the method", () => {
    const doc = courseDoc();
    expect(doc.draftNote).toBe(DRAFT_NOTE);
    expect(doc.tables.map((t) => t.id)).toEqual(["outcomes", "matrix", "assessments", "co-detail", "co", "po"]);
    const matrix = doc.tables[1];
    expect(matrix.columns.map((c) => c.header)).toEqual(["CO", "PO1", "PSO1"]);
    expect(matrix.rows).toEqual([
      ["CO1", 3, "–"],
      ["CO2", 2, "–"],
      ["Average", "2.50", "–"],
    ]);
    const co = doc.tables.find((t) => t.id === "co")!;
    expect(co.rows[0]).toEqual(["CO1", "75.0%", 3, "2", "Yes", expect.stringContaining("75.0% of students")]);
    expect(co.rows[1].slice(0, 5)).toEqual(["CO2", "—", "—", "2", "—"]);
    const po = doc.tables.find((t) => t.id === "po")!;
    expect(po.rows[0].slice(0, 3)).toEqual(["PO1", "Engineering knowledge", "3.00"]);
    expect(doc.meta).toContainEqual(["Academic year", "2026–27"]);
    expect(doc.fileBase).toBe("CO-attainment-ME201-2026-10-26");
    expect(doc.method.join(" ")).toMatch(/Σ\(CO–PO mapping × CO level\)/);
  });

  it("never uses banned words", () => {
    const doc = courseDoc();
    const text = JSON.stringify(doc);
    expect(usesBannedWords(text)).toBe(false);
  });
});

describe("buildProgramReport", () => {
  it("has a programme row with the mean per PO", () => {
    const rows = [
      { label: "ME201 Thermodynamics", teacher: "Kavita Sharma", academicYear: "", outcomes: 2, assessed: 1, met: 1, values: { po1: 2.4, pso1: null } },
      { label: "ME204 Fluid Mechanics", teacher: "Kavita Sharma", academicYear: "", outcomes: 3, assessed: 0, met: 0, values: { po1: 1.8, pso1: null } },
    ];
    const results = programAttainment(pos, rows.map((r, i) => ({ courseId: `c${i}`, label: r.label, values: r.values })));
    const doc = buildProgramReport({
      institution: "",
      program: { name: "B.Tech Mechanical Engineering", department: "Mechanical" },
      programOutcomes: pos,
      courses: rows,
      results,
      generatedAt: new Date("2026-10-26T06:00:00Z"),
    });
    const byCourse = doc.tables.find((t) => t.id === "by-course")!;
    expect(byCourse.rows.at(-1)).toEqual(["Programme", "2.10", "–"]);
    expect(doc.fileBase).toBe("PO-attainment-BTech-Mechanical-Engineering-2026-10-26");
  });
});

describe("renderers", () => {
  it("writes a PDF that starts like one", async () => {
    const bytes = await renderReportPdf(courseDoc());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("writes a workbook with a cover sheet and one sheet per table, draft note on each", async () => {
    const doc = courseDoc();
    const bytes = await renderReportXlsx(doc);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(book.worksheets.map((w) => w.name)).toEqual([
      "About this report",
      "Course outcomes",
      "CO–PO mapping (course articula",
      "Assessments used",
      "CO attainment by assessment",
      "CO attainment",
      "PO attainment from this cours",
    ].map((n) => n.slice(0, 28).trim()));
    for (const sheet of book.worksheets) expect(sheet.getCell("A1").value).toBe(DRAFT_NOTE);
    const co = book.getWorksheet("CO attainment")!;
    const values = co.getSheetValues().flat().filter((v) => v !== undefined && v !== null);
    expect(values).toContain("75.0%");
  });
});
