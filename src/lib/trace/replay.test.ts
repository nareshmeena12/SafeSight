import { describe, expect, it } from "vitest";
import { buildReplayClock, latestAt } from "./replay";

describe("buildReplayClock", () => {
  it("keeps short gaps and squeezes long pauses", () => {
    const clock = buildReplayClock([0, 1000, 3000, 3_603_000], 4000);
    expect(clock.duration).toBe(3000 + 4000);
    expect(clock.toReplay(2000)).toBe(2000);
    expect(clock.toReplay(3_603_000)).toBe(7000);
    expect(clock.toWall(7000)).toBe(3_603_000);
    expect(clock.toWall(5000)).toBe(3000 + 1_800_000);
    expect(clock.toWall(-5)).toBe(0);
  });

  it("is empty without times", () => {
    expect(buildReplayClock([]).duration).toBe(0);
  });
});

describe("latestAt", () => {
  const items = [{ at: 10 }, { at: 20 }, { at: 30 }];
  it("finds the last item at or before a time", () => {
    expect(latestAt(items, 5)).toBeNull();
    expect(latestAt(items, 20)).toEqual({ at: 20 });
    expect(latestAt(items, 29)).toEqual({ at: 20 });
    expect(latestAt(items, 99)).toEqual({ at: 30 });
  });
});
