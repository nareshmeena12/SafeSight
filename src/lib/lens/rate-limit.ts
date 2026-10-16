/**
 * A small per-teacher limit on Lens requests to protect the model budget:
 * at most LIMIT requests in any WINDOW. In memory, so it is per server
 * instance — a guard against runaway loops, not a billing control.
 */
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 40;

const hits = new Map<string, number[]>();

export function allowLensRequest(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}
