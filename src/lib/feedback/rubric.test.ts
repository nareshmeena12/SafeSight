import { describe, expect, it } from "vitest";
import { assembleFeedback, parseRubric, saveFeedbackSchema, totalPoints } from "./rubric";

describe("parseRubric", () => {
  it("reads criteria, marks and descriptions in the common formats", () => {
    expect(
      parseRubric(`- Correct method (10): picks the right process and equations
2. Working shown — 5 marks
Units [2]
* Clarity - easy to follow

Problem-solving`),
    ).toEqual([
      { criterion: "Correct method", description: "picks the right process and equations", maxPoints: 10 },
      { criterion: "Working shown", description: "", maxPoints: 5 },
      { criterion: "Units", description: "", maxPoints: 2 },
      { criterion: "Clarity", description: "easy to follow", maxPoints: null },
      { criterion: "Problem-solving", description: "", maxPoints: null },
    ]);
  });

  it("keeps at most 8 criteria and ignores blank lines", () => {
    expect(parseRubric("\n\n")).toEqual([]);
    expect(parseRubric(Array.from({ length: 12 }, (_, i) => `C${i}`).join("\n"))).toHaveLength(8);
  });
});

describe("assembleFeedback", () => {
  const rubric = parseRubric("Method (10)\nClarity");

  it("maps comments in order, clamps points and drops them where there are no marks", () => {
    const out = assembleFeedback(
      {
        criteria: [
          { points: 12, comment: "Your choice of process is right; now show why n = 1.3." },
          { points: 4, comment: "Clear layout; label each step with what it finds." },
        ],
        overall: "Solid method. Next time, check units at the end.",
      },
      rubric,
    )!;
    expect(out.criteria.map((c) => [c.criterion, c.points])).toEqual([
      ["Method", 10],
      ["Clarity", null],
    ]);
  });

  it("rejects the wrong number of criteria and banned words", () => {
    expect(assembleFeedback({ criteria: [{ comment: "Only one comment here." }], overall: "Overall comment." }, rubric)).toBeNull();
    expect(
      assembleFeedback(
        { criteria: [{ comment: "This looks AI-generated to me." }, { comment: "Fine work on the layout." }], overall: "Overall comment." },
        rubric,
      ),
    ).toBeNull();
  });
});

describe("saveFeedbackSchema", () => {
  const base = { submissionId: "00000000-0000-4000-8000-000000000001", overall: "", status: "approved" as const };

  it("won't let marks pass the maximum", () => {
    const r = saveFeedbackSchema.safeParse({ ...base, criteria: [{ criterion: "Method", maxPoints: 5, points: 6, comment: "ok" }] });
    expect(r.success).toBe(false);
  });

  it("won't share empty feedback, but a draft may be empty", () => {
    const criteria = [{ criterion: "Method", maxPoints: null, points: null, comment: "" }];
    expect(saveFeedbackSchema.safeParse({ ...base, criteria }).success).toBe(false);
    expect(saveFeedbackSchema.safeParse({ ...base, criteria, status: "draft" }).success).toBe(true);
  });

  it("totals only when every marked criterion has points", () => {
    expect(totalPoints([{ points: 7, maxPoints: 10 }, { points: 3, maxPoints: 5 }, { points: null, maxPoints: null }])).toEqual({ points: 10, max: 15 });
    expect(totalPoints([{ points: null, maxPoints: 10 }])).toBeNull();
  });
});
