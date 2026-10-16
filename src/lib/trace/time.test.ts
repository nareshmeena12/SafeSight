import { describe, expect, it } from "vitest";
import { clampEventTime } from "./time";

describe("clampEventTime", () => {
  const now = 1_800_000_000_000;
  it("keeps recent timestamps", () => {
    expect(clampEventTime(now - 5_000, now)).toBe(now - 5_000);
  });
  it("replaces far-future and very old timestamps with now", () => {
    expect(clampEventTime(now + 10 * 60_000, now)).toBe(now);
    expect(clampEventTime(now - 24 * 60 * 60_000, now)).toBe(now);
  });
  it("pulls small clock skew back to now", () => {
    expect(clampEventTime(now + 2_000, now)).toBe(now);
  });
});
