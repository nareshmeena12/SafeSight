import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import { formatMinutesShort, templateSummary, usesBannedWords } from "./summary";

const t0 = Date.UTC(2026, 9, 16, 9, 2); // 14:32 IST

describe("templateSummary", () => {
  it("states the facts in neutral words", () => {
    const m = computeMetrics(
      [
        { type: "type", size: 100, at: t0 - 4 * 60_000 },
        { type: "paste", size: 780, at: t0 },
      ],
      { chars: 1000, pastedChars: 700 },
    );
    const text = templateSummary(m);
    expect(text).toBe(
      "Written over 1 session, 4 minutes active. One paste at 14:32 added 780 characters, about 78% of the final length. Pasted text makes up 70% of the final text.",
    );
    expect(usesBannedWords(text)).toBe(false);
  });

  it("says so when nothing was pasted or recorded", () => {
    const typed = computeMetrics([{ type: "type", size: 5, at: t0 }], { chars: 5, pastedChars: 0 });
    expect(templateSummary(typed)).toContain("No pastes were recorded");
    expect(templateSummary(computeMetrics([], { chars: 0, pastedChars: 0 }))).toBe(
      "No writing activity was recorded for this submission.",
    );
  });
});

describe("usesBannedWords", () => {
  it("rejects accusatory wording", () => {
    expect(usesBannedWords("The student may have cheated.")).toBe(true);
    expect(usesBannedWords("This looks AI-generated.")).toBe(true);
    expect(usesBannedWords("Written over 2 sessions.")).toBe(false);
  });
});

describe("formatMinutesShort", () => {
  it("keeps stat cards short", () => {
    expect(formatMinutesShort(0.4)).toBe("<1 min");
    expect(formatMinutesShort(52.2)).toBe("52 min");
    expect(formatMinutesShort(65)).toBe("1 h 5 min");
    expect(formatMinutesShort(120)).toBe("2 h");
  });
});
