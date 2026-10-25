import { describe, expect, it } from "vitest";
import { masteryBand, reviewList, setScore, updateMastery } from "./mastery";

describe("updateMastery", () => {
  it("starts from the first result", () => {
    expect(updateMastery(null, 0.67, "practice")).toEqual({ mastery: 0.67, evidence: 1 });
  });
  it("moves part of the way with each new result", () => {
    const after = updateMastery({ mastery: 0.5, evidence: 2 }, 1, "practice");
    expect(after).toEqual({ mastery: 0.7, evidence: 3 });
    // Explain-backs and refreshers move it less than a practice set.
    expect(updateMastery({ mastery: 0.5, evidence: 2 }, 1, "explain_back").mastery).toBe(0.65);
  });
  it("one bad result doesn't erase steady work", () => {
    let m = null as ReturnType<typeof updateMastery> | null;
    for (let i = 0; i < 4; i++) m = updateMastery(m, 1, "practice");
    expect(updateMastery(m, 0, "practice").mastery).toBeGreaterThanOrEqual(0.6);
  });
  it("clamps bad input", () => {
    expect(updateMastery(null, 7, "practice").mastery).toBe(1);
    expect(updateMastery(null, Number.NaN, "practice").mastery).toBe(0);
  });
});

describe("masteryBand", () => {
  it("has three bands", () => {
    expect(masteryBand(0.39)).toBe("needs_work");
    expect(masteryBand(0.4)).toBe("getting_there");
    expect(masteryBand(0.75)).toBe("strong");
  });
});

describe("reviewList", () => {
  const topics = [
    { topicKey: "entropy", mastery: 0.3 },
    { topicKey: "first law", mastery: 0.9 },
    { topicKey: "ideal gas", mastery: 0.55 },
  ];
  it("lists weak topics, weakest first", () => {
    expect(reviewList(topics).map((t) => t.topicKey)).toEqual(["entropy", "ideal gas"]);
  });
  it("adds strong topics with a repeated, unreviewed mistake", () => {
    const list = reviewList(topics, [
      { topicKey: "first law", count: 3, reviewed: false },
      { topicKey: "ideal gas", count: 4, reviewed: true },
    ]);
    expect(list.find((t) => t.topicKey === "first law")?.repeatedMistakes).toBe(3);
    expect(list.find((t) => t.topicKey === "ideal gas")?.repeatedMistakes).toBe(0);
  });
});

describe("setScore", () => {
  it("averages graded items", () => {
    expect(setScore([1, 0.5, null])).toBe(0.75);
    expect(setScore([null])).toBeNull();
  });
});
