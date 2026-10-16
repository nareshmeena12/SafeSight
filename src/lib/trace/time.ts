/** How far back a queued event may be dated (e.g. after being offline). */
export const MAX_EVENT_AGE_MS = 12 * 60 * 60_000;
/** Allowed client clock skew into the future. */
export const MAX_EVENT_SKEW_MS = 60_000;

/** Keeps client timestamps within a sane window; anything outside becomes `now`. */
export function clampEventTime(at: number, now: number): number {
  if (at > now + MAX_EVENT_SKEW_MS) return now;
  if (at < now - MAX_EVENT_AGE_MS) return now;
  return Math.min(at, now);
}
