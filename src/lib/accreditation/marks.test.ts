import { describe, expect, it } from "vitest";
import { expandLabels, labelKey, marksInOrder, marksTemplate, parseMarks } from "./marks";

const questions = [
  { label: "Q1", maxMarks: 10 },
  { label: "Q2a", maxMarks: 5 },
  { label: "Q2b", maxMarks: 5 },
];

describe("labelKey and expandLabels", () => {
  it("matches the ways colleges write question numbers", () => {
    expect(labelKey("Q1")).toBe("1");
    expect(labelKey("Q.No. 2(a)")).toBe("2a");
    expect(labelKey("question 2 b")).toBe("2b");
    expect(labelKey("2b")).toBe("2b");
  });
  it("expands ranges and lists", () => {
    expect(expandLabels("Q1-Q3, Q4a, Q4b")).toEqual(["Q1", "Q2", "Q3", "Q4a", "Q4b"]);
    expect(expandLabels("1 to 2")).toEqual(["Q1", "Q2"]);
  });
});

describe("parseMarks", () => {
  it("reads question columns in any order, blanks, AB and decimals", () => {
    const csv = ["S.No,Roll No.,Student Name,Q 2(b),Q1,2a,Total", "1,me23b001,Riya Sharma,4,8.5,,12.5", "2,ME23B002,Arjun Mehta,AB,AB,AB,", "3,ME23B003,Sneha Iyer,5,10,5,20"].join("\n");
    const out = parseMarks(csv, questions);
    expect(out.errors).toEqual([]);
    expect(out.matchedQuestions).toEqual(["Q1", "Q2a", "Q2b"]);
    expect(out.rows).toEqual([
      { line: 2, rollNumber: "ME23B001", email: null, name: "Riya Sharma", marks: [8.5, null, 4], absent: false },
      { line: 3, rollNumber: "ME23B002", email: null, name: "Arjun Mehta", marks: [null, null, null], absent: true },
      { line: 4, rollNumber: "ME23B003", email: null, name: "Sneha Iyer", marks: [10, 5, 5], absent: false },
    ]);
  });

  it("rejects marks above the maximum, negatives and words; keeps the rest", () => {
    const csv = "Email,Q1,Q2a\nriya@x.in,11,2\narjun@x.in,-1,2\nsneha@x.in,seven,1\nkabir@x.in,9,";
    const out = parseMarks(csv, questions);
    expect(out.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(out.errors[0].message).toMatch(/out of 10/);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ email: "kabir@x.in", rollNumber: null, marks: [9, null, null] });
    expect(out.warnings.some((w) => /No column for Q2b/.test(w.message))).toBe(true);
  });

  it("needs a header with an id column and a question column", () => {
    expect(parseMarks("ME23B001,8,4", questions).errors[0].message).toMatch(/column names/);
    expect(parseMarks("Roll no,Marks\nME23B001,8", questions).errors[0].message).toMatch(/No column matches/);
  });

  it("keeps the later row for a repeated student", () => {
    const out = parseMarks("Roll,Q1\nME1,3\nme1,7", questions);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].marks[0]).toBe(7);
    expect(out.warnings[1].message).toMatch(/appears again/);
  });
});

describe("marksTemplate and marksInOrder", () => {
  it("writes one row per student and reads stored marks by question id", () => {
    expect(marksTemplate([{ label: "Q1" }], [{ rollNumber: "ME1", email: "", name: "Sharma, Riya" }])).toBe('Roll number,Email,Name,Q1\nME1,,"Sharma, Riya",');
    expect(marksInOrder({ a: 3, c: null }, [{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual([3, null, null]);
    expect(marksInOrder("junk", [{ id: "a" }])).toEqual([null]);
  });
});
