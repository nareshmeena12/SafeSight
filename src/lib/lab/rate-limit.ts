/**
 * Best-effort in-memory limit per key (one server instance). A lab often sits
 * behind one public IP, so limits are generous for normal joins and tight for
 * wrong codes, which is what guessing would look like.
 */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** True if `key` is already over the limit (does not count a hit). */
    blocked(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      hits.set(key, recent);
      return recent.length >= max;
    },
    hit(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) hits.clear();
    },
  };
}
