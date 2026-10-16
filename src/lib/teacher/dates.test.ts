import { describe, expect, it } from "vitest";
import { formatRelative, weekStart, weeksAgo } from "./dates";

describe("weekStart", () => {
  it("returns the Monday of the week in India time", () => {
    // Wednesday 15 Oct 2026, midday UTC.
    expect(weekStart(new Date("2026-10-14T12:00:00Z"))).toBe("2026-10-12");
  });

  it("uses India time near midnight", () => {
    // Sunday 23:00 UTC is already Monday 04:30 in India.
    expect(weekStart(new Date("2026-10-18T23:00:00Z"))).toBe("2026-10-19");
    // Monday 00:30 India time is still Sunday in UTC.
    expect(weekStart(new Date("2026-10-11T19:00:00Z"))).toBe("2026-10-12");
  });

  it("counts back whole weeks", () => {
    expect(weeksAgo(new Date("2026-10-14T12:00:00Z"), 2)).toBe("2026-09-28");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("handles never-active students", () => expect(formatRelative(null, now)).toBe("Not yet"));
  it("formats minutes, hours and days", () => {
    expect(formatRelative("2026-10-16T11:50:00Z", now)).toBe("10 min ago");
    expect(formatRelative("2026-10-16T09:00:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-10-15T10:00:00Z", now)).toBe("Yesterday");
    expect(formatRelative("2026-10-12T10:00:00Z", now)).toBe("4 days ago");
  });
});
