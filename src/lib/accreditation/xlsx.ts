import "server-only";
import ExcelJS from "exceljs";
import type { ReportDoc, ReportTable } from "./report";

/**
 * Renders a report (lib/accreditation/report.ts) as an Excel workbook: a
 * cover sheet (details, the draft notice, how the numbers were computed) and
 * one sheet per table, each with the draft notice on top, a bold header row
 * that stays in view, borders and wrapped text. Numbers stay numbers so the
 * department can recompute them.
 */

const BORDER = { style: "thin" as const, color: { argb: "FFB8BCC2" } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const HEAD_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEDEFF2" } };
const DRAFT_FONT = { bold: true, color: { argb: "FF995C00" } };

/** Sheet names: ≤ 31 characters, none of : \ / ? * [ ], unique. */
function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Sheet";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 26)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** Keeps text that looks like a formula from running in Excel. */
function safe(value: string | number | null) {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return /^[=+\-@]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
}

function addTable(book: ExcelJS.Workbook, table: ReportTable, doc: ReportDoc, used: Set<string>) {
  const sheet = book.addWorksheet(sheetName(table.title, used));
  const cols = table.columns.length;
  sheet.columns = table.columns.map((c) => ({ width: Math.max(8, Math.min(70, Math.round(c.width * 1.3))) }));

  sheet.addRow([doc.draftNote]).font = DRAFT_FONT;
  sheet.addRow([`${doc.title} — ${doc.subtitle}`]).font = { bold: true, size: 12 };
  sheet.addRow([table.title]).font = { bold: true };
  if (table.note) sheet.addRow([table.note]).font = { italic: true, color: { argb: "FF61666D" } };
  sheet.addRow([]);
  for (let r = 1; r <= sheet.rowCount; r++) if (cols > 1) sheet.mergeCells(r, 1, r, cols);

  const head = sheet.addRow(table.columns.map((c) => c.header));
  const headIndex = head.number;
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = HEAD_FILL;
    cell.border = BORDERS;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  table.rows.forEach((values, i) => {
    const row = sheet.addRow(values.map(safe));
    if (table.strongRows?.includes(i)) row.font = { bold: true };
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      const align = table.columns[c - 1].align;
      cell.border = BORDERS;
      cell.alignment = { vertical: "top", wrapText: true, horizontal: align === "center" ? "center" : align === "right" ? "right" : "left" };
    }
  });
  sheet.views = [{ state: "frozen", ySplit: headIndex }];
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.headerFooter = { oddHeader: `&L${doc.draftNote}&R&P / &N` };
}

export async function renderReportXlsx(doc: ReportDoc): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = "SafeSight";
  book.title = `${doc.title} — ${doc.subtitle}`;
  book.subject = doc.draftNote;
  book.created = new Date();
  const used = new Set<string>();

  const cover = book.addWorksheet(sheetName("About this report", used));
  cover.columns = [{ width: 22 }, { width: 110 }];
  cover.addRow([doc.draftNote]).font = { ...DRAFT_FONT, size: 12 };
  cover.mergeCells(1, 1, 1, 2);
  cover.addRow([doc.title]).font = { bold: true, size: 14 };
  cover.addRow([doc.subtitle]).font = { size: 12 };
  cover.addRow([]);
  for (const [label, value] of doc.meta) {
    const row = cover.addRow([label, safe(value)]);
    row.getCell(1).font = { bold: true };
  }
  cover.addRow([]);
  cover.addRow(["How the numbers were computed"]).font = { bold: true };
  for (const line of doc.method) {
    const row = cover.addRow(["", safe(line)]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
  cover.addRow([]);
  cover.addRow(["Sheets", doc.tables.map((t) => t.title).join(" · ")]).getCell(1).font = { bold: true };
  cover.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  for (const table of doc.tables) addTable(book, table, doc, used);
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
