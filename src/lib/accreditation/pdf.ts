import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Cell, ReportDoc, ReportTable } from "./report";

/**
 * Renders a report (lib/accreditation/report.ts) as an A4 landscape PDF:
 * plain bordered tables, the header row repeated on every page, "Draft —
 * verify against your university's format" on every page, page numbers.
 * Standard PDF fonts only (no files to bundle), so text outside Latin-1 is
 * swapped for a close ASCII spelling.
 */

const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 36;
const CONTENT = PAGE.width - MARGIN * 2;
const INK = rgb(0.11, 0.12, 0.13);
const MUTED = rgb(0.38, 0.4, 0.43);
const RULE = rgb(0.72, 0.74, 0.77);
const HEAD_FILL = rgb(0.93, 0.94, 0.95);
const STRONG_FILL = rgb(0.97, 0.97, 0.98);
const DRAFT = rgb(0.6, 0.36, 0.0);

const SWAPS: Record<string, string> = {
  "≥": ">=",
  "≤": "<=",
  "→": "->",
  "←": "<-",
  "Σ": "Sum",
  "≈": "~",
  "−": "-",
  "✓": "Yes",
  "\u202f": " ",
};

function textFor(font: PDFFont) {
  const ok = new Map<string, boolean>();
  return (value: Cell): string => {
    const raw = value === null || value === undefined ? "" : String(value);
    let out = "";
    for (const ch of raw.normalize("NFC")) {
      if (SWAPS[ch]) {
        out += SWAPS[ch];
        continue;
      }
      let good = ok.get(ch);
      if (good === undefined) {
        try {
          font.encodeText(ch);
          good = true;
        } catch {
          good = false;
        }
        ok.set(ch, good);
      }
      out += good ? ch : "?";
    }
    return out;
  };
}

/** Word-wraps text to a width; words longer than the width are broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      let part = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(part + ch, size) > width && part) {
          lines.push(part);
          part = "";
        }
        part += ch;
      }
      line = part;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function renderReportPdf(doc: ReportDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} — ${doc.subtitle}`);
  pdf.setSubject(doc.draftNote);
  pdf.setProducer("SafeSight");
  pdf.setCreator("SafeSight");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const t = textFor(regular);

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = 0;

  function pageHeader() {
    const top = PAGE.height - MARGIN;
    page.drawText("SafeSight", { x: MARGIN, y: top - 8, size: 8, font: bold, color: MUTED });
    const draft = t(doc.draftNote.toUpperCase());
    page.drawText(draft, { x: PAGE.width - MARGIN - bold.widthOfTextAtSize(draft, 8), y: top - 8, size: 8, font: bold, color: DRAFT });
    page.drawLine({ start: { x: MARGIN, y: top - 14 }, end: { x: PAGE.width - MARGIN, y: top - 14 }, thickness: 0.5, color: RULE });
    y = top - 30;
  }

  function newPage() {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageHeader();
  }

  function ensure(height: number) {
    if (y - height < MARGIN + 18) newPage();
  }

  function paragraph(text: string, size: number, font: PDFFont = regular, color = INK, gap = 4) {
    const lines = wrap(t(text), font, size, CONTENT);
    for (const line of lines) {
      ensure(size + 3);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  }

  pageHeader();

  // Title block.
  paragraph(doc.title, 18, bold, INK, 2);
  paragraph(doc.subtitle, 12, regular, MUTED, 10);
  for (const [label, value] of doc.meta) {
    ensure(13);
    page.drawText(t(label), { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
    const lines = wrap(t(value), regular, 9, CONTENT - 110);
    lines.forEach((line, i) => page.drawText(line, { x: MARGIN + 110, y: y - 9 - i * 12, size: 9, font: regular, color: INK }));
    y -= 12 * lines.length + 1;
  }
  y -= 8;
  // The draft notice, boxed.
  const notice = `${doc.draftNote}. SafeSight prepared these tables from the marks and mappings entered in it; check every figure and the layout your university or NBA / NAAC expects before submitting.`;
  const noticeLines = wrap(t(notice), regular, 9, CONTENT - 20);
  const boxH = noticeLines.length * 12 + 12;
  ensure(boxH + 6);
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: CONTENT, height: boxH, borderColor: DRAFT, borderWidth: 0.75 });
  noticeLines.forEach((line, i) => page.drawText(line, { x: MARGIN + 10, y: y - 15 - i * 12, size: 9, font: regular, color: INK }));
  y -= boxH + 18;

  for (const table of doc.tables) drawTable(table);

  // Method.
  ensure(40);
  paragraph("How the numbers were computed", 12, bold, INK, 4);
  for (const line of doc.method) paragraph(`•  ${line}`, 9, regular, INK, 3);

  // Footers once the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = t(`${doc.title} — ${doc.subtitle}`);
    p.drawText(label.length > 110 ? `${label.slice(0, 107)}...` : label, { x: MARGIN, y: MARGIN - 14, size: 7.5, font: regular, color: MUTED });
    const num = `Page ${i + 1} of ${pages.length}`;
    p.drawText(num, { x: PAGE.width - MARGIN - regular.widthOfTextAtSize(num, 7.5), y: MARGIN - 14, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();

  function drawTable(table: ReportTable) {
    const size = 8;
    const lineH = 10;
    const pad = 4;
    const total = table.columns.reduce((n, c) => n + c.width, 0);
    const widths = table.columns.map((c) => (c.width / total) * CONTENT);

    const layout = (cells: Cell[], font: PDFFont) => {
      const lines = cells.map((c, i) => wrap(t(c), font, size, widths[i] - pad * 2));
      return { lines, height: Math.max(...lines.map((l) => l.length)) * lineH + pad * 2 };
    };
    const head = layout(
      table.columns.map((c) => c.header),
      bold,
    );

    const drawRow = (lines: string[][], height: number, font: PDFFont, fill?: ReturnType<typeof rgb>) => {
      let x = MARGIN;
      lines.forEach((cellLines, i) => {
        const w = widths[i];
        page.drawRectangle({ x, y: y - height, width: w, height, borderColor: RULE, borderWidth: 0.5, color: fill });
        const align = table.columns[i].align ?? "left";
        cellLines.forEach((line, j) => {
          const tw = font.widthOfTextAtSize(line, size);
          const tx = align === "right" ? x + w - pad - tw : align === "center" ? x + (w - tw) / 2 : x + pad;
          page.drawText(line, { x: tx, y: y - pad - size - j * lineH + 1, size, font, color: INK });
        });
        x += w;
      });
      y -= height;
    };

    // Title (kept with the header and first row).
    const titleLines = wrap(t(table.title), bold, 11, CONTENT);
    const noteLines = table.note ? wrap(t(table.note), regular, 8, CONTENT) : [];
    const first = table.rows[0] ? layout(table.rows[0], regular).height : 0;
    ensure(titleLines.length * 14 + noteLines.length * 10 + head.height + first + 6);
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN, y: y - 11, size: 11, font: bold, color: INK });
      y -= 14;
    }
    for (const line of noteLines) {
      page.drawText(line, { x: MARGIN, y: y - 8, size: 8, font: regular, color: MUTED });
      y -= 10;
    }
    y -= 4;
    drawRow(head.lines, head.height, bold, HEAD_FILL);
    if (!table.rows.length) {
      const empty = layout(["Nothing yet.", ...table.columns.slice(1).map(() => "")], regular);
      drawRow(empty.lines, empty.height, regular);
    }
    table.rows.forEach((row, i) => {
      const strong = table.strongRows?.includes(i) ?? false;
      const font = strong ? bold : regular;
      const r = layout(row, font);
      if (y - r.height < MARGIN + 18) {
        newPage();
        page.drawText(t(`${table.title} (continued)`), { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
        y -= 14;
        drawRow(head.lines, head.height, bold, HEAD_FILL);
      }
      drawRow(r.lines, r.height, font, strong ? STRONG_FILL : undefined);
    });
    y -= 20;
  }
}
