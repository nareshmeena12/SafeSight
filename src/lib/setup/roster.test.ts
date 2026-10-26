import { describe, expect, it } from "vitest";
import { normaliseRoll, parseRoster, splitCsv } from "./roster";

describe("splitCsv", () => {
  it("reads quoted fields with commas, doubled quotes and line breaks", () => {
    const out = splitCsv('name,email\n"Sharma, Riya",riya@x.in\n"Arjun ""AJ"" Mehta","arjun@x.in"\n"Two\nlines",t@x.in');
    expect(out.map((r) => r.cells)).toEqual([
      ["name", "email"],
      ["Sharma, Riya", "riya@x.in"],
      ['Arjun "AJ" Mehta', "arjun@x.in"],
      ["Two lines", "t@x.in"],
    ]);
    expect(out[3].line).toBe(4);
  });

  it("detects semicolons and tabs and skips blank lines", () => {
    expect(splitCsv("a;b\n\n1;2").map((r) => r.cells)).toEqual([["a", "b"], ["1", "2"]]);
    expect(splitCsv("a\tb\r\n1\t2").map((r) => r.cells)).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseRoster", () => {
  it("reads a header in any order with common column names", () => {
    const { rows, errors } = parseRoster(
      "﻿Roll No.,Student Name,E-mail\nme23b001,Riya Sharma,Riya@Demo.in\nME23B002 ,Arjun Mehta,arjun@demo.in",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: "Riya Sharma", email: "riya@demo.in", rollNumber: "ME23B001" },
      { line: 3, name: "Arjun Mehta", email: "arjun@demo.in", rollNumber: "ME23B002" },
    ]);
  });

  it("joins first and last name columns", () => {
    const { rows } = parseRoster("First name,Last name,Email,USN\nSneha,Iyer,sneha@x.in,1MS21ME045");
    expect(rows[0]).toMatchObject({ name: "Sneha Iyer", rollNumber: "1MS21ME045" });
  });

  it("guesses columns without a header", () => {
    const { rows } = parseRoster("Riya Sharma, riya@x.in, ME23B001\nME23B002,arjun@x.in,Arjun Mehta\n1,Sneha Iyer,sneha@x.in");
    expect(rows[0]).toMatchObject({ name: "Riya Sharma", email: "riya@x.in", rollNumber: "ME23B001" });
    expect(rows[1]).toMatchObject({ name: "Arjun Mehta", email: "arjun@x.in", rollNumber: "ME23B002" });
    // A short bare number is a serial number: neither the name nor the roll number.
    expect(rows[2]).toMatchObject({ name: "Sneha Iyer", email: "sneha@x.in", rollNumber: null });
  });

  it("works with an email-only list", () => {
    const { rows, errors } = parseRoster("riya@x.in\narjun@x.in");
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.email)).toEqual(["riya@x.in", "arjun@x.in"]);
  });

  it("reports bad emails, missing emails and duplicates by line", () => {
    const { rows, errors, warnings } = parseRoster("name,email\nRiya,riya@x.in\nArjun,not-an-email\nSneha,\nRiya again,RIYA@x.in");
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(warnings).toEqual([{ line: 5, message: "riya@x.in is already on line 2; this line is skipped." }]);
  });

  it("drops a roll number it can't store, with a warning", () => {
    const { rows, warnings } = parseRoster("name,email,roll\nRiya,riya@x.in,ME#23");
    expect(rows[0].rollNumber).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("asks for an email column when the header has none", () => {
    const { rows, errors } = parseRoster("name,roll\nRiya,ME1");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/email column/);
  });

  it("normalises roll numbers", () => {
    expect(normaliseRoll(" me 23 b001 ")).toBe("ME23B001");
  });
});
