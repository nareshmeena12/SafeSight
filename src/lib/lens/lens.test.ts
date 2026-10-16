import { describe, expect, it } from "vitest";
import { lensInstructions } from "./prompt";
import { allowLensRequest } from "./rate-limit";

describe("lensInstructions", () => {
  const text = lensInstructions({ teacherName: "Kavita Sharma", today: "Friday, 16 October 2026" });

  it("names the teacher and the date", () => {
    expect(text).toContain("Kavita Sharma");
    expect(text).toContain("16 October 2026");
  });

  it("only uses the banned words to forbid them", () => {
    // CLAUDE.md: never "cheating", "cheater", "catch", "spy" or "AI-generated".
    const rule = text.split("\n").find((l) => l.includes("never use the words")) ?? "";
    const rest = text.replace(rule, "").toLowerCase();
    for (const word of ["cheat", "catch", "spy", "ai-generated"]) expect(rest).not.toContain(word);
  });
});

describe("allowLensRequest", () => {
  it("allows 40 requests per 10 minutes per teacher", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 40; i++) expect(allowLensRequest("teacher-a", t0 + i)).toBe(true);
    expect(allowLensRequest("teacher-a", t0 + 100)).toBe(false);
    expect(allowLensRequest("teacher-b", t0 + 100)).toBe(true);
    expect(allowLensRequest("teacher-a", t0 + 10 * 60 * 1000 + 50)).toBe(true);
  });
});
