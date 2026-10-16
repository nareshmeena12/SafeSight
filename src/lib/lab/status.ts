import { JOIN_EARLY_MS, SILENT_AFTER_MS } from "./constants";
import type { LabEventType } from "./schemas";

/** Live state of sessions and seats. Pure, so the grid, the API and tests agree. */

export type SessionTimes = { starts_at: string; ends_at: string; ended_at: string | null };
export type SessionState = "upcoming" | "live" | "ended";

/** When monitoring stops: the planned end, or earlier if the teacher ended it. */
export function effectiveEnd(s: SessionTimes): number {
  const planned = Date.parse(s.ends_at);
  return s.ended_at ? Math.min(planned, Date.parse(s.ended_at)) : planned;
}

export function sessionState(s: SessionTimes, now: number): SessionState {
  if (now >= effectiveEnd(s)) return "ended";
  if (now < Date.parse(s.starts_at)) return "upcoming";
  return "live";
}

/** Joining opens a little before the start and closes at the end. */
export function canJoin(s: SessionTimes, now: number): "open" | "too_early" | "ended" {
  if (now >= effectiveEnd(s)) return "ended";
  if (now < Date.parse(s.starts_at) - JOIN_EARLY_MS) return "too_early";
  return "open";
}

/**
 * Seat colours on the grid:
 *   silent — no heartbeat for 30 s while the session runs (red)
 *   attention — tried a blocked site, or went silent earlier (amber)
 *   ok — recording normally (green)
 *   done — the extension stopped (finished or session over; grey)
 */
export type SeatStatus = "ok" | "attention" | "silent" | "done";

export type SeatLike = { last_heartbeat_at: string; stopped_at: string | null };

/** Event types that turn a seat amber. Tab switches and copy/paste are normal lab work. */
export const attentionTypes: ReadonlySet<LabEventType> = new Set(["blocked_site", "heartbeat_gap"]);

export function seatStatus(
  seat: SeatLike,
  attentionCount: number,
  sessionEnded: boolean,
  now: number,
): SeatStatus {
  if (seat.stopped_at || sessionEnded) return "done";
  if (now - Date.parse(seat.last_heartbeat_at) > SILENT_AFTER_MS) return "silent";
  return attentionCount > 0 ? "attention" : "ok";
}

/** Clamps an event time from a lab PC into [from, to]. */
export function clampTime(at: number, from: number, to: number): number {
  return Math.min(Math.max(at, from), to);
}

/** sessionState at this moment (for server components). */
export function currentSessionState(s: SessionTimes): SessionState {
  return sessionState(s, Date.now());
}
