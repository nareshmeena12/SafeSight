import type { TraceMetrics } from "./metrics";

/** Times in summaries are shown in Indian Standard Time. */
export const TRACE_TIME_ZONE = "Asia/Kolkata";

/**
 * Words Trace never uses (CLAUDE.md → Product voice). A model summary that
 * contains one is discarded and the template summary is used instead.
 */
const bannedPatterns = [
  /cheat/i,
  /\bcatch/i,
  /\bcaught\b/i,
  /\bspy/i,
  /ai[\s-]*generated/i,
  /plagiar/i,
  /dishonest/i,
  /\bsuspicious/i,
  /\bguilty\b/i,
  /\bcopied\b/i,
];

export function usesBannedWords(text: string): boolean {
  return bannedPatterns.some((p) => p.test(text));
}

export function formatClock(at: number) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TRACE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

export function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatMinutes(minutes: number) {
  if (minutes < 1) return "under a minute";
  const m = Math.round(minutes);
  if (m < 60) return plural(m, "minute");
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${plural(h, "hour")} ${plural(rest, "minute")}` : plural(h, "hour");
}

/** Compact duration for stat cards: "<1 min", "52 min", "1 h 5 min". */
export function formatMinutesShort(minutes: number) {
  if (minutes < 1) return "<1 min";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${m / 60} h`;
}

/**
 * The template evidence summary: plain facts, no judgement. Used when no model
 * is configured, when the model fails, or when its wording breaks the rules.
 */
export function templateSummary(m: TraceMetrics): string {
  if (m.firstAt === null || m.finalChars === 0) {
    return "No writing activity was recorded for this submission.";
  }

  const parts: string[] = [
    `Written over ${plural(m.sessions, "session")}, ${formatMinutes(m.activeMinutes)} active.`,
  ];

  if (m.pastes.length === 0) {
    parts.push("No pastes were recorded; the text was typed in the editor.");
  } else {
    const largest = m.pastes.reduce((a, b) => (b.size > a.size ? b : a));
    const pasteWord = m.pastes.length === 1 ? "One paste" : `${m.pastes.length} pastes; the largest`;
    parts.push(
      `${pasteWord} at ${formatClock(largest.at)} added ${largest.size.toLocaleString("en-IN")} characters, about ${formatPercent(largest.shareOfFinal)} of the final length.`,
    );
    parts.push(`Pasted text makes up ${formatPercent(m.pasteRatio)} of the final text.`);
  }

  return parts.join(" ");
}
