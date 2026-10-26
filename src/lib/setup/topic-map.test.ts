import { describe, expect, it } from "vitest";
import {
  cleanText,
  cleanTopicMap,
  normaliseOutcomeCode,
  outcomesToText,
  textToOutcomes,
  textToTopics,
  withSavedIds,
} from "./topic-map";

describe("cleanText", () => {
  it("drops bullets, numbering and trailing separators", () => {
    expect(cleanText("  1.  First law for closed systems; ")).toBe("First law for closed systems");
    expect(cleanText("• Entropy")).toBe("Entropy");
    expect(cleanText("(iii) Polytropic processes.")).toBe("Polytropic processes");
    expect(cleanText("2.3 Zeroth law")).toBe("Zeroth law");
  });

  it("turns an all-caps line into a sentence", () => {
    expect(cleanText("UNIT I BASIC CONCEPTS AND FIRST LAW")).toBe("Unit i basic concepts and first law");
    expect(cleanText("SI UNITS")).toBe("SI units");
    expect(cleanText("COP")).toBe("COP");
  });
});

describe("cleanTopicMap", () => {
  it("tidies, splits long comma lists, dedupes and fills missing titles", () => {
    const map = cleanTopicMap({
      courseName: " Engineering   Thermodynamics ",
      courseCode: "me 201",
      units: [
        {
          title: "Unit 1: Basic concepts",
          topics: [
            "Systems, surroundings and boundaries, properties and state, processes and cycles, quasi-static processes, work and heat transfer",
            "Work and heat transfer",
          ],
        },
        { title: "", topics: ["Entropy"] },
        { title: "", topics: [] },
      ],
      outcomes: [
        { code: "CO 1", description: "Apply the first law to closed systems." },
        { code: "", description: "Evaluate entropy change." },
        { code: "co1", description: "Duplicate code" },
      ],
    });
    expect(map.courseName).toBe("Engineering Thermodynamics");
    expect(map.courseCode).toBe("ME201");
    expect(map.units).toHaveLength(2);
    expect(map.units[0].topics).toEqual([
      "Systems",
      "surroundings and boundaries",
      "properties and state",
      "processes and cycles",
      "quasi-static processes",
      "work and heat transfer",
    ]);
    expect(map.units[1]).toEqual({ title: "Unit 2", topics: ["Entropy"] });
    expect(map.outcomes).toEqual([
      { code: "CO1", description: "Apply the first law to closed systems" },
      { code: "CO2", description: "Evaluate entropy change" },
      { code: "CO3", description: "Duplicate code" },
    ]);
  });
});

describe("editor text", () => {
  it("reads topics one per line", () => {
    expect(textToTopics("Entropy\n\n- Entropy\nThird law\n")).toEqual(["Entropy", "Third law"]);
  });

  it("reads and writes outcomes", () => {
    const outcomes = textToOutcomes("CO1: Apply the first law\nCO-2 - Evaluate entropy\nDesign a simple cycle");
    expect(outcomes).toEqual([
      { code: "CO1", description: "Apply the first law" },
      { code: "CO2", description: "Evaluate entropy" },
      { code: "CO3", description: "Design a simple cycle" },
    ]);
    expect(outcomesToText(outcomes)).toBe("CO1: Apply the first law\nCO2: Evaluate entropy\nCO3: Design a simple cycle");
  });

  it("normalises outcome codes", () => {
    expect(normaliseOutcomeCode("co.4", 0)).toBe("CO4");
    expect(normaliseOutcomeCode("", 2)).toBe("CO3");
    expect(normaliseOutcomeCode("PSO 1", 0)).toBe("PSO1");
  });
});

describe("withSavedIds", () => {
  const saved = {
    units: [
      { id: "u1", title: "Basics", topics: [{ id: "t1", title: "Entropy" }, { id: "t2", title: "First law" }] },
      { id: "u2", title: "Cycles", topics: [{ id: "t3", title: "Otto cycle" }] },
    ],
    outcomes: [{ id: "o1", code: "CO1", description: "Old" }],
  };

  it("keeps ids for matching topics (even moved), units by title then position, outcomes by code", () => {
    const out = withSavedIds(
      {
        units: [
          { title: "Fundamentals", topics: ["First law", "Zeroth law"] },
          { title: "Cycles", topics: ["Otto cycle", "entropy"] },
        ],
        outcomes: [
          { code: "CO1", description: "New text" },
          { code: "CO2", description: "Added" },
        ],
      },
      saved,
    );
    expect(out.units[0]).toEqual({ id: "u1", title: "Fundamentals", topics: [{ id: "t2", title: "First law" }, { title: "Zeroth law" }] });
    expect(out.units[1]).toEqual({ id: "u2", title: "Cycles", topics: [{ id: "t3", title: "Otto cycle" }, { id: "t1", title: "entropy" }] });
    expect(out.outcomes).toEqual([
      { id: "o1", code: "CO1", description: "New text" },
      { id: undefined, code: "CO2", description: "Added" },
    ]);
  });

  it("never gives one id to two topics", () => {
    const out = withSavedIds({ units: [{ title: "Basics", topics: ["Entropy"] }, { title: "More", topics: ["Entropy"] }], outcomes: [] }, saved);
    expect(out.units[0].topics[0].id).toBe("t1");
    expect(out.units[1].topics[0].id).toBeUndefined();
  });
});
