import type { WritingEventType } from "./schemas";

/** A gap longer than this between two events is a pause, not active writing. */
export const IDLE_GAP_MS = 5 * 60_000;
/** A gap longer than this starts a new writing session. */
export const SESSION_GAP_MS = 30 * 60_000;

export type TimedEvent = { type: WritingEventType; size: number; at: number };

export type PasteEvidence = {
  at: number;
  size: number;
  /** Paste size as a share of the final text length, 0–1 (capped). */
  shareOfFinal: number;
};

export type TraceMetrics = {
  /** Share of the final text that still carries the paste mark, 0–1. */
  pasteRatio: number;
  activeMinutes: number;
  sessions: number;
  typedChars: number;
  pastedChars: number;
  deletedChars: number;
  pastes: PasteEvidence[];
  firstAt: number | null;
  lastAt: number | null;
  finalChars: number;
};

/**
 * Neutral numbers about how a text was written. Pure: the caller passes the
 * events (any order), the final text length and how much of it was pasted.
 */
export function computeMetrics(
  events: readonly TimedEvent[],
  final: { chars: number; pastedChars: number },
): TraceMetrics {
  const sorted = [...events].sort((a, b) => a.at - b.at);

  let activeMs = 0;
  let sessions = sorted.length > 0 ? 1 : 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].at - sorted[i - 1].at;
    if (gap > SESSION_GAP_MS) sessions++;
    if (gap <= IDLE_GAP_MS) activeMs += gap;
  }

  let typedChars = 0;
  let pastedChars = 0;
  let deletedChars = 0;
  const pastes: PasteEvidence[] = [];
  for (const e of sorted) {
    if (e.type === "type") typedChars += e.size;
    if (e.type === "delete") deletedChars += e.size;
    if (e.type === "paste") {
      pastedChars += e.size;
      pastes.push({
        at: e.at,
        size: e.size,
        shareOfFinal: final.chars > 0 ? Math.min(1, e.size / final.chars) : 0,
      });
    }
  }

  const pasteRatio = final.chars > 0 ? clamp01(final.pastedChars / final.chars) : 0;

  return {
    pasteRatio,
    activeMinutes: Math.round((activeMs / 60_000) * 10) / 10,
    sessions,
    typedChars,
    pastedChars,
    deletedChars,
    pastes,
    firstAt: sorted.at(0)?.at ?? null,
    lastAt: sorted.at(-1)?.at ?? null,
    finalChars: final.chars,
  };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Merges runs of the same edit type that start within `windowMs` of each other,
 * so a burst of keystrokes becomes one row. Focus and blur are never merged.
 */
export function coalesceEvents<T extends TimedEvent>(events: readonly T[], windowMs = 1_000): T[] {
  const out: T[] = [];
  let runStart = 0;
  for (const e of events) {
    const last = out.at(-1);
    const mergeable = e.type === "type" || e.type === "delete";
    if (last && mergeable && last.type === e.type && e.at - runStart < windowMs) {
      out[out.length - 1] = { ...last, size: last.size + e.size };
    } else {
      out.push({ ...e });
      runStart = e.at;
    }
  }
  return out;
}
