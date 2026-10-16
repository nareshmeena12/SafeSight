import { formatClock, formatMinutes, usesBannedWords } from "@/lib/trace/summary";
import { SILENT_AFTER_MS } from "./constants";
import type { EventDetail } from "./describe";
import { siteName } from "./domains";
import type { LabEventType } from "./schemas";

/**
 * S15: a seat's evidence summary after the session, in Trace's neutral style:
 * what was recorded, with times and counts, and no judgement. Teachers decide
 * what it means. Pure, so the report page, the CSV and tests agree.
 */

export type ReportEvent = { type: LabEventType; detail: EventDetail; at: string };

export type SeatMetrics = {
  joinedAt: number;
  /** When recording stopped: the student finished, or the session ended. */
  endAt: number;
  finishedEarly: boolean;
  presentMinutes: number;
  rejoins: number;
  blockedAttempts: number;
  /** Site name → attempts, most first. */
  blockedSites: { site: string; count: number }[];
  tabSwitches: number;
  leftBrowser: number;
  awayMinutes: number;
  copies: number;
  pastes: number;
  pastedChars: number;
  idlePeriods: number;
  idleMinutes: number;
  silentPeriods: number;
  silentMinutes: number;
};

export function computeSeatMetrics(input: {
  joinedAt: string;
  lastHeartbeatAt: string;
  sessionEnd: number;
  events: readonly ReportEvent[];
}): SeatMetrics {
  const events = [...input.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const joinedAt = Date.parse(input.joinedAt);
  const left = events.findLast((e) => e.type === "left");
  const finishedEarly = Boolean(left) && Date.parse(left!.at) < input.sessionEnd;
  const endAt = Math.max(joinedAt, finishedEarly ? Date.parse(left!.at) : input.sessionEnd);

  const sites = new Map<string, number>();
  const m: SeatMetrics = {
    joinedAt,
    endAt,
    finishedEarly,
    presentMinutes: (endAt - joinedAt) / 60_000,
    rejoins: 0,
    blockedAttempts: 0,
    blockedSites: [],
    tabSwitches: 0,
    leftBrowser: 0,
    awayMinutes: 0,
    copies: 0,
    pastes: 0,
    pastedChars: 0,
    idlePeriods: 0,
    idleMinutes: 0,
    silentPeriods: 0,
    silentMinutes: 0,
  };

  let awaySince: number | null = null;
  let idleSince: number | null = null;
  for (const e of events) {
    const at = Math.min(Date.parse(e.at), endAt);
    switch (e.type) {
      case "rejoined":
        m.rejoins += 1;
        break;
      case "blocked_site": {
        m.blockedAttempts += 1;
        const site = e.detail.host ? siteName(e.detail.host) : "a blocked site";
        sites.set(site, (sites.get(site) ?? 0) + 1);
        break;
      }
      case "tab_switch":
        m.tabSwitches += 1;
        break;
      case "left_browser":
        m.leftBrowser += 1;
        awaySince ??= at;
        break;
      case "returned":
        if (awaySince !== null) m.awayMinutes += (at - awaySince) / 60_000;
        else if (e.detail.seconds) m.awayMinutes += e.detail.seconds / 60;
        awaySince = null;
        break;
      case "copy":
        m.copies += 1;
        break;
      case "paste":
        m.pastes += 1;
        m.pastedChars += e.detail.chars ?? 0;
        break;
      case "idle":
        if (idleSince === null) m.idlePeriods += 1;
        idleSince ??= at;
        break;
      case "active":
        if (idleSince !== null) m.idleMinutes += (at - idleSince) / 60_000;
        idleSince = null;
        break;
      case "heartbeat_gap":
        m.silentPeriods += 1;
        m.silentMinutes += (e.detail.seconds ?? 0) / 60;
        break;
      default:
        break;
    }
  }
  // Still away or idle when recording stopped.
  if (awaySince !== null) m.awayMinutes += (endAt - awaySince) / 60_000;
  if (idleSince !== null) m.idleMinutes += (endAt - idleSince) / 60_000;

  // Went silent and never came back before the end (browser closed, extension off).
  // (The API stops moving last_heartbeat_at once the session is over.)
  const lastBeat = Date.parse(input.lastHeartbeatAt);
  if (endAt - lastBeat > SILENT_AFTER_MS) {
    m.silentPeriods += 1;
    m.silentMinutes += (endAt - lastBeat) / 60_000;
  }

  m.blockedSites = [...sites].map(([site, count]) => ({ site, count })).sort((a, b) => b.count - a.count);
  return m;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const timesWord = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** The neutral evidence summary for one seat (Indian Standard Time). */
export function labSummary(m: SeatMetrics): string {
  const parts: string[] = [];
  parts.push(
    m.finishedEarly
      ? `Joined at ${formatClock(m.joinedAt)} and finished at ${formatClock(m.endAt)} (${formatMinutes(m.presentMinutes)}).`
      : `Joined at ${formatClock(m.joinedAt)} and recorded until the session ended at ${formatClock(m.endAt)} (${formatMinutes(m.presentMinutes)}).`,
  );

  if (m.blockedAttempts === 0) {
    parts.push("No blocked sites were opened.");
  } else {
    const list = m.blockedSites.map((s) => `${s.site} ${timesWord(s.count)}`).join(", ");
    parts.push(`The extension blocked ${plural(m.blockedAttempts, "attempt")} to open a blocked site: ${list}.`);
  }

  const moves: string[] = [];
  if (m.tabSwitches) moves.push(`switched tabs ${timesWord(m.tabSwitches)}`);
  if (m.leftBrowser) {
    moves.push(`moved to another app ${timesWord(m.leftBrowser)}, ${formatMinutes(m.awayMinutes)} away from Chrome in all`);
  }
  if (moves.length) parts.push(`${capitalise(moves.join(" and "))}.`);

  if (m.copies || m.pastes) {
    const bits: string[] = [];
    if (m.copies) bits.push(`copy ${timesWord(m.copies)}`);
    if (m.pastes) bits.push(`paste ${timesWord(m.pastes)} (${plural(m.pastedChars, "character")} pasted)`);
    parts.push(`Used ${bits.join(" and ")}.`);
  }

  if (m.idlePeriods) {
    parts.push(`No keyboard or mouse input for ${formatMinutes(m.idleMinutes)} in total, over ${plural(m.idlePeriods, "stretch", "stretches")}.`);
  }
  if (m.silentPeriods) {
    parts.push(
      `The extension sent no signal ${timesWord(m.silentPeriods)}, ${formatMinutes(m.silentMinutes)} in all (for example a closed browser or a restart).`,
    );
  }
  if (m.rejoins) parts.push(`Joined again ${timesWord(m.rejoins)} with the same roll number.`);

  const text = parts.join(" ");
  // The template never uses these words; keep it that way.
  if (usesBannedWords(text)) throw new Error("lab summary broke the product voice rules");
  return text;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 field, and no leading = + - @ so spreadsheets don't run it as a formula. */
export function csvField(value: string | number | null | undefined): string {
  let v = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export const csvHeader = [
  "Seat",
  "Roll number",
  "Student",
  "Joined (IST)",
  "Recording stopped (IST)",
  "Minutes recorded",
  "Blocked site attempts",
  "Blocked sites",
  "Tab switches",
  "Moved to another app",
  "Minutes away from Chrome",
  "Copy",
  "Paste",
  "Characters pasted",
  "Idle minutes",
  "No-signal stretches",
  "No-signal minutes",
  "Joined again",
  "Summary",
] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function csvRow(
  seat: { seatLabel: string; rollNumber: string; studentName: string | null },
  m: SeatMetrics,
  summary: string,
): (string | number)[] {
  return [
    seat.seatLabel,
    seat.rollNumber,
    seat.studentName ?? "",
    formatClock(m.joinedAt),
    formatClock(m.endAt),
    round1(m.presentMinutes),
    m.blockedAttempts,
    m.blockedSites.map((s) => `${s.site} (${s.count})`).join("; "),
    m.tabSwitches,
    m.leftBrowser,
    round1(m.awayMinutes),
    m.copies,
    m.pastes,
    m.pastedChars,
    round1(m.idleMinutes),
    m.silentPeriods,
    round1(m.silentMinutes),
    m.rejoins,
    summary,
  ];
}
