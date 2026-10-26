import { describe, expect, it } from "vitest";
import { groupSimilarDoubts, keywords, similarity, suggestedTitle, type DoubtText } from "./similar";

const d = (id: string, studentId: string, question: string, stuckOn = "", assignmentId: string | null = null): DoubtText => ({
  id,
  studentId,
  assignmentId,
  question,
  stuckOn,
});

describe("keywords", () => {
  it("keeps content words and drops filler", () => {
    expect(keywords("How do I find the boundary work in polytropic processes?")).toEqual(["boundary", "work", "polytropic", "process"]);
  });
});

describe("groupSimilarDoubts", () => {
  const doubts = [
    d("1", "riya", "How do I get boundary work for a polytropic process?", "sign of the work"),
    d("2", "arjun", "Polytropic process boundary work — which formula?", "the work sign"),
    d("3", "sneha", "Is boundary work negative in polytropic compression?"),
    d("4", "kabir", "What is entropy as disorder?"),
    d("5", "riya", "Polytropic boundary work again, sign of the work?"),
  ];

  it("groups questions about the same thing from different students", () => {
    const groups = groupSimilarDoubts(doubts);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(["1", "2", "3", "5"]);
    expect(groups[0].students).toBe(3);
    expect(groups[0].words).toContain("polytropic");
    expect(suggestedTitle(groups[0])).toMatch(/^About .*polytropic/);
  });

  it("needs at least two different students", () => {
    expect(groupSimilarDoubts([doubts[0], doubts[4]])).toEqual([]);
  });

  it("doesn't group unrelated questions", () => {
    expect(similarity(doubts[0], doubts[3])).toBe(0);
    expect(groupSimilarDoubts([doubts[0], doubts[3]])).toEqual([]);
  });

  it("gives a small lift to questions on the same assignment", () => {
    const a = d("a", "x", "first law sign convention", "", "A1");
    const b = d("b", "y", "sign of heat in first law", "", "A1");
    const c = { ...b, assignmentId: "A2" };
    expect(similarity(a, b)).toBeGreaterThan(similarity(a, c));
  });

  it("has a plain title when no word is shared by most of the group", () => {
    expect(suggestedTitle({ words: [] })).toBe("Answer to a question several of you asked");
  });
});
