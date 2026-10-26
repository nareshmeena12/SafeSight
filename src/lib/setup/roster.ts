import { z } from "zod";

/**
 * Class lists from a CSV file or pasted from a spreadsheet: name, email and
 * roll number per student. Colleges export these in every shape, so this
 * reads commas, semicolons or tabs, quoted fields, an optional header row in
 * any order ("Student name", "E-mail", "Roll no.", "USN", …) and, without a
 * header, guesses each column from what is in it. Pure, so the browser
 * preview and the server import read a list the same way.
 */

export const MAX_ROSTER_ROWS = 500;

export type RosterRow = { line: number; name: string; email: string; rollNumber: string | null };
export type RosterIssue = { line: number; message: string };
export type ParsedRoster = { rows: RosterRow[]; errors: RosterIssue[]; warnings: RosterIssue[] };

const emailSchema = z.email();
const ROLL = /^[A-Z0-9/-]{1,32}$/;

/** Upper case, no spaces: the same shape as profiles.roll_number. */
export function normaliseRoll(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function detectDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180-ish: quoted fields may hold the delimiter, doubled quotes and line breaks. */
export function splitCsv(text: string): { cells: string[]; line: number }[] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n").find((l) => l.trim()) ?? "";
  const delimiter = detectDelimiter(firstLine);
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n") {
      cells.push(cell);
      records.push({ cells, line: startLine });
      cells = [];
      cell = "";
      line++;
      startLine = line;
    } else cell += ch;
  }
  cells.push(cell);
  records.push({ cells, line: startLine });
  return records
    .map((r) => ({ ...r, cells: r.cells.map((c) => c.replace(/\s+/g, " ").trim()) }))
    .filter((r) => r.cells.some((c) => c !== ""));
}

type Column = "name" | "email" | "roll" | "first" | "last";

function headerColumn(cell: string): Column | null {
  const h = cell.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (/^(e ?mail|email address|e mail id|email id|mail|mail id)$/.test(h) || h.includes("email")) return "email";
  if (/^(first name|given name|first)$/.test(h)) return "first";
  if (/^(last name|surname|family name|last)$/.test(h)) return "last";
  if (/\b(roll|usn|reg|registration|enrol+ment|admission|prn|student id|id no)\b/.test(h)) return "roll";
  if (/\bname\b/.test(h) || h === "student") return "name";
  return null;
}

/** A row is a header when at least two of its cells name a column and none is an email address. */
function readHeader(cells: string[]): (Column | null)[] | null {
  if (cells.some((c) => c.includes("@"))) return null;
  const cols = cells.map(headerColumn);
  return cols.filter(Boolean).length >= 2 || (cols.includes("email") && cells.length === 1) ? cols : null;
}

/** Without a header: the email is the cell with an @, a roll number has digits and no spaces, the rest is the name. */
function guessRow(cells: string[]): { name: string; email: string; roll: string } {
  const emailIdx = cells.findIndex((c) => c.includes("@"));
  const rest = cells.map((c, i) => ({ c, i })).filter(({ i }) => i !== emailIdx);
  // A short bare number is a serial ("S.No."), not a roll number.
  const rollCell = rest.find(({ c }) => /\d/.test(c) && !/\s/.test(c) && !/^\d{1,3}$/.test(c) && ROLL.test(normaliseRoll(c)));
  const nameCells = rest.filter(({ i, c }) => i !== rollCell?.i && c && !/^\d+$/.test(c));
  return {
    email: emailIdx >= 0 ? cells[emailIdx] : "",
    roll: rollCell?.c ?? "",
    name: nameCells.map(({ c }) => c).join(" "),
  };
}

export function parseRoster(text: string): ParsedRoster {
  const records = splitCsv(text);
  const rows: RosterRow[] = [];
  const errors: RosterIssue[] = [];
  const warnings: RosterIssue[] = [];
  if (!records.length) return { rows, errors, warnings };

  const header = readHeader(records[0].cells);
  const body = header ? records.slice(1) : records;
  if (header && !header.includes("email")) {
    errors.push({ line: records[0].line, message: "We couldn't find an email column. Add one called “Email”." });
    return { rows, errors, warnings };
  }

  const seen = new Map<string, number>();
  for (const { cells, line } of body) {
    if (rows.length >= MAX_ROSTER_ROWS) {
      errors.push({ line, message: `Only the first ${MAX_ROSTER_ROWS} students can be added at once. Import the rest separately.` });
      break;
    }
    let name = "";
    let email = "";
    let roll = "";
    if (header) {
      const first: string[] = [];
      const last: string[] = [];
      header.forEach((col, i) => {
        const v = cells[i] ?? "";
        if (col === "email" && !email) email = v;
        else if (col === "roll" && !roll) roll = v;
        else if (col === "name" && !name) name = v;
        else if (col === "first") first.push(v);
        else if (col === "last") last.push(v);
      });
      if (!name) name = [...first, ...last].filter(Boolean).join(" ");
    } else ({ name, email, roll } = guessRow(cells));

    email = email.replace(/^mailto:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
    if (!email) {
      errors.push({ line, message: "No email address on this line." });
      continue;
    }
    if (!emailSchema.safeParse(email).success) {
      errors.push({ line, message: `“${email.slice(0, 60)}” doesn't look like an email address.` });
      continue;
    }
    const earlier = seen.get(email);
    if (earlier) {
      warnings.push({ line, message: `${email} is already on line ${earlier}; this line is skipped.` });
      continue;
    }
    seen.set(email, line);

    let rollNumber: string | null = roll ? normaliseRoll(roll) : null;
    if (rollNumber && !ROLL.test(rollNumber)) {
      warnings.push({ line, message: `Roll number “${roll.slice(0, 40)}” can only use letters, digits, / and -. It was left out.` });
      rollNumber = null;
    }
    rows.push({ line, name: name.slice(0, 120), email, rollNumber });
  }
  return { rows, errors, warnings };
}
