/** Pauses longer than this are squeezed down to it in the replay. */
export const MAX_REPLAY_GAP_MS = 4_000;

export type ReplayClock = {
  /** Replay length in ms. */
  duration: number;
  toReplay: (wall: number) => number;
  toWall: (replay: number) => number;
};

/**
 * Maps wall-clock time onto a compressed replay timeline: real gaps up to
 * MAX_REPLAY_GAP_MS play as they happened, longer pauses (a break, another
 * day) shrink to MAX_REPLAY_GAP_MS so the replay stays watchable.
 */
export function buildReplayClock(times: readonly number[], maxGap = MAX_REPLAY_GAP_MS): ReplayClock {
  const wall = [...new Set(times)].sort((a, b) => a - b);
  if (wall.length === 0) return { duration: 0, toReplay: () => 0, toWall: () => 0 };

  const replay = [0];
  for (let i = 1; i < wall.length; i++) {
    replay.push(replay[i - 1] + Math.min(wall[i] - wall[i - 1], maxGap));
  }
  const duration = replay.at(-1)!;

  // Index of the last point <= value in a sorted array.
  const floorIndex = (arr: number[], value: number) => {
    let lo = 0;
    let hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= value) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const interpolate = (from: number[], to: number[], value: number) => {
    if (value <= from[0]) return to[0];
    if (value >= from.at(-1)!) return to.at(-1)!;
    const i = floorIndex(from, value);
    const span = from[i + 1] - from[i];
    const t = span > 0 ? (value - from[i]) / span : 0;
    return to[i] + t * (to[i + 1] - to[i]);
  };

  return {
    duration,
    toReplay: (w) => interpolate(wall, replay, w),
    toWall: (r) => interpolate(replay, wall, r),
  };
}

/** The last item whose `at` is at or before `wall`, or null. Items sorted by `at`. */
export function latestAt<T extends { at: number }>(items: readonly T[], wall: number): T | null {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].at <= wall) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? items[found] : null;
}
