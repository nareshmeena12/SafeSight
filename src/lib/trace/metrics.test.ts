import { describe, expect, it } from "vitest";
import { coalesceEvents, computeMetrics, type TimedEvent } from "./metrics";

const min = 60_000;
const t0 = Date.UTC(2026, 9, 16, 9, 0); // 14:30 IST

describe("computeMetrics", () => {
  it("counts active time, sessions and pastes", () => {
    const events: TimedEvent[] = [
      { type: "focus", size: 0, at: t0 },
      { type: "type", size: 40, at: t0 + 1 * min },
      { type: "type", size: 60, at: t0 + 3 * min },
      // 20 minute pause: same session, not active.
      { type: "paste", size: 300, at: t0 + 23 * min },
      { type: "delete", size: 10, at: t0 + 24 * min },
      // Next day: new session.
      { type: "type", size: 50, at: t0 + 24 * 60 * min },
      { type: "type", size: 50, at: t0 + 24 * 60 * min + 2 * min },
    ];
    const m = computeMetrics(events, { chars: 400, pastedChars: 280 });
    expect(m.sessions).toBe(2);
    expect(m.activeMinutes).toBe(3 + 1 + 2);
    expect(m.typedChars).toBe(200);
    expect(m.pastedChars).toBe(300);
    expect(m.deletedChars).toBe(10);
    expect(m.pasteRatio).toBeCloseTo(0.7);
    expect(m.pastes).toEqual([{ at: t0 + 23 * min, size: 300, shareOfFinal: 0.75 }]);
    expect(m.firstAt).toBe(t0);
  });

  it("handles no events and an empty text", () => {
    const m = computeMetrics([], { chars: 0, pastedChars: 0 });
    expect(m).toMatchObject({ sessions: 0, activeMinutes: 0, pasteRatio: 0, firstAt: null });
  });

  it("sorts events and caps shares at 100%", () => {
    const m = computeMetrics(
      [
        { type: "paste", size: 900, at: t0 + min },
        { type: "focus", size: 0, at: t0 },
      ],
      { chars: 500, pastedChars: 600 },
    );
    expect(m.pastes[0].shareOfFinal).toBe(1);
    expect(m.pasteRatio).toBe(1);
    expect(m.activeMinutes).toBe(1);
  });
});

describe("coalesceEvents", () => {
  it("merges bursts of the same edit type within a second", () => {
    const out = coalesceEvents([
      { type: "type", size: 1, at: 1000 },
      { type: "type", size: 1, at: 1200 },
      { type: "type", size: 1, at: 1900 },
      { type: "type", size: 1, at: 2100 },
      { type: "delete", size: 1, at: 2200 },
      { type: "paste", size: 50, at: 2300 },
      { type: "paste", size: 50, at: 2400 },
    ]);
    expect(out).toEqual([
      { type: "type", size: 3, at: 1000 },
      { type: "type", size: 1, at: 2100 },
      { type: "delete", size: 1, at: 2200 },
      { type: "paste", size: 50, at: 2300 },
      { type: "paste", size: 50, at: 2400 },
    ]);
  });
});
