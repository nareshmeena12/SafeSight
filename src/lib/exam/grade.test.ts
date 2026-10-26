import { describe, expect, it } from "vitest";
import { bandScore, finalValue, mockScore, numericMatch, readNumbers, secondsLeft, topicScores } from "./grade";
import { parseSyllabus, syllabusText } from "./syllabus";

describe("readNumbers", () => {
  it("reads numbers as students write them", () => {
    expect(readNumbers("W = 1,200 kJ and ΔS = −3 J/K")).toEqual([1200, -3]);
    expect(readNumbers("1.2 × 10^5 Pa, 6.02x10^{23}, 3e-2")).toEqual([1.2e5, 6.02e23, 0.03]);
    expect(finalValue("−0.462 kJ/K")).toBe(-0.462);
    expect(finalValue("It decreases")).toBeNull();
  });
});

describe("numericMatch", () => {
  it("accepts the final value within 2%", () => {
    expect(numericMatch("ΔS = m c ln(350/290) = 1.57 kJ/K", "1.572 kJ/K")).toBe(true);
    expect(numericMatch("ΔS = 1.60 kJ/K", "1.572 kJ/K")).toBe(true);
    expect(numericMatch("ΔS = 1.65 kJ/K", "1.572 kJ/K")).toBe(false);
  });

  it("only looks at the last numbers, so listing many values doesn't pass", () => {
    expect(numericMatch("maybe 1.572 or 2 or 3 or 4 or 5", "1.572 kJ/K")).toBe(false);
    expect(numericMatch("anything", "It decreases")).toBe(false);
  });
});

describe("marks", () => {
  it("keeps model scores in their verdict's band", () => {
    expect(bandScore("correct", 0.5)).toBe(0.8);
    expect(bandScore("partly", 1)).toBe(0.79);
    expect(bandScore("not_yet", 0.6)).toBe(0.29);
  });

  it("leaves unchecked questions out of the total", () => {
    const s = mockScore([
      { marks: 1, score: 1, verdict: "correct" },
      { marks: 4, score: 0.5, verdict: "partly" },
      { marks: 3, score: null, verdict: "unchecked" },
    ]);
    expect(s).toEqual({ marks: 3, max: 5, score: 0.6, unchecked: 1 });
    expect(mockScore([]).score).toBeNull();
  });

  it("scores each topic by marks", () => {
    expect(
      topicScores([
        { topic: "Entropy", marks: 1, score: 1, verdict: "correct" },
        { topic: "Entropy", marks: 3, score: 0, verdict: "not_yet" },
        { topic: "First law", marks: 4, score: null, verdict: "unchecked" },
      ]),
    ).toEqual([{ topic: "Entropy", score: 0.25 }]);
  });

  it("counts seconds left", () => {
    expect(secondsLeft("2026-10-26T10:00:30Z", Date.parse("2026-10-26T10:00:00Z"))).toBe(30);
    expect(secondsLeft("2026-10-26T10:00:00Z", Date.parse("2026-10-26T11:00:00Z"))).toBe(0);
  });
});

describe("parseSyllabus", () => {
  it("reads units, bullets and numbering", () => {
    const { topics, error } = parseSyllabus(
      "Thermodynamic systems\nUnit 1:\n- First law for closed systems\n2. Polytropic processes\n\nUnit 2 — Entropy change\nClausius inequality\nU3: Rankine cycle",
    );
    expect(error).toBeNull();
    expect(topics).toEqual([
      { title: "Thermodynamic systems", unit: null },
      { title: "First law for closed systems", unit: "Unit 1" },
      { title: "Polytropic processes", unit: "Unit 1" },
      { title: "Entropy change", unit: "Unit 2" },
      { title: "Clausius inequality", unit: "Unit 2" },
      { title: "Rankine cycle", unit: "Unit 3" },
    ]);
    expect(parseSyllabus(syllabusText(topics)).topics).toEqual(topics);
  });

  it("keeps ordinary topics that start like a unit word", () => {
    expect(parseSyllabus("Part load efficiency").topics).toEqual([{ title: "Part load efficiency", unit: null }]);
  });

  it("drops duplicates and refuses very long lists", () => {
    expect(parseSyllabus("Entropy\nentropy").topics).toHaveLength(1);
    expect(parseSyllabus(Array.from({ length: 41 }, (_, i) => `Topic ${i}`).join("\n")).error).toMatch(/40 or fewer/);
  });
});
