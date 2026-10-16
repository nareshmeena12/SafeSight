import { describe, expect, it } from "vitest";
import { greetingName, pilotFieldErrors, pilotFormRoles, pilotRequestSchema } from "./schema";

const valid = {
  name: "Dr. Ananya Rao",
  role: "Professor",
  institution: "Shivalik Institute of Technology",
  email: " Ananya.Rao@College.edu.in ",
};

describe("pilotRequestSchema", () => {
  it("accepts a complete request and normalises the email", () => {
    const parsed = pilotRequestSchema.parse(valid);
    expect(parsed.email).toBe("ananya.rao@college.edu.in");
    expect(pilotFormRoles[parsed.role]).toBe("teacher");
  });

  it("maps every form role onto the pilot_role enum", () => {
    expect(Object.values(pilotFormRoles).sort()).toEqual(["admin", "hod", "other", "teacher"]);
  });

  it("returns the design's messages for each missing field", () => {
    expect(pilotFieldErrors({ name: " ", role: "", institution: "", email: "" })).toEqual({
      name: "Please tell us your name.",
      role: "Choose the role closest to yours.",
      institution: "Which college or institute are you from?",
      email: "We need an email address to reach you.",
    });
  });

  it("explains an incomplete email", () => {
    expect(pilotFieldErrors({ ...valid, email: "ananya.rao@nitk" }).email).toMatch(
      /looks incomplete/,
    );
  });

  it("rejects unknown roles and over-long input", () => {
    expect(pilotRequestSchema.safeParse({ ...valid, role: "Student" }).success).toBe(false);
    expect(pilotRequestSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(pilotRequestSchema.safeParse({ ...valid, name: 42 }).success).toBe(false);
  });
});

describe("greetingName", () => {
  it("keeps a title with the surname, otherwise the first name", () => {
    expect(greetingName("Dr. Ananya Rao")).toBe("Dr. Rao");
    expect(greetingName("Prof Arjun Mehta")).toBe("Prof Mehta");
    expect(greetingName("Riya Sharma")).toBe("Riya");
    expect(greetingName("  ")).toBe("there");
  });
});
