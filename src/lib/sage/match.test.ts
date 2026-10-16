import { describe, expect, it } from "vitest";
import { assignmentKind, bestMatch, isActive, lexicalSimilarity, MATCH_THRESHOLD } from "./match";
import { code, essay, thermo } from "./test-fixtures";

describe("assignmentKind", () => {
  it("tells problems, essays and code apart", () => {
    expect(assignmentKind(thermo.title, thermo.instructions)).toBe("problem");
    expect(assignmentKind(essay.title, essay.instructions)).toBe("essay");
    expect(assignmentKind(code.title, code.instructions)).toBe("code");
  });
});

describe("lexicalSimilarity", () => {
  it("scores a pasted question near 1", () => {
    expect(lexicalSimilarity(thermo.instructions, thermo)).toBeGreaterThan(0.9);
  });

  it("scores salami slices with the problem's numbers above the threshold", () => {
    expect(lexicalSimilarity("what's the volume of 0.8 kg of air at 150 kPa?", thermo)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("matches a message that names the assignment", () => {
    expect(lexicalSimilarity("help me prepare answers for the mid-semester test", { title: "Mid-semester test", instructions: "Closed-book." })).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(lexicalSimilarity("how does newton raphson work in python?", code)).toBeLessThan(MATCH_THRESHOLD);
    const ps = (n: number) => ({ title: `Thermodynamics problem set ${n}`, instructions: "Solve problems 1–6." });
    expect(lexicalSimilarity("thermodynamics problem set 3, problem 2 please", ps(3))).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(lexicalSimilarity("thermodynamics problem set 3, problem 2 please", ps(2))).toBeLessThan(MATCH_THRESHOLD);
  });

  it("keeps a general concept question about the same topic low", () => {
    expect(lexicalSimilarity("what is entropy?", essay)).toBeLessThan(MATCH_THRESHOLD);
    expect(lexicalSimilarity("why is boundary work the area under a P-V curve?", thermo)).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("bestMatch", () => {
  it("takes the higher of the model's and the lexical match", () => {
    const list = [thermo, essay];
    expect(bestMatch(thermo.instructions, list, { ref: null, similarity: 0 }).assignmentId).toBe(thermo.id);
    expect(bestMatch("hello", list, { ref: "A2", similarity: 0.7 })).toEqual({ assignmentId: essay.id, similarity: 0.7 });
    expect(bestMatch("hello", list, { ref: "A9", similarity: 0.9 }).assignmentId).toBeNull();
  });
});

describe("isActive", () => {
  it("keeps assignments active until two weeks after the due date", () => {
    const now = Date.parse("2026-11-06T00:00:00Z");
    expect(isActive({ dueAt: null }, now)).toBe(true);
    expect(isActive({ dueAt: "2026-11-01T00:00:00Z" }, now)).toBe(true);
    expect(isActive({ dueAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
  });
});
