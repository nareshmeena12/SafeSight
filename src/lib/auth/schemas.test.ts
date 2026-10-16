import { describe, expect, it } from "vitest";
import { joinCodeSchema, magicLinkSchema, passwordStrength, signupSchema } from "./schemas";

const valid = {
  fullName: "Riya Sharma",
  email: "Riya@Example.com ",
  password: "learning-first",
  role: "student",
};

describe("signupSchema", () => {
  it("accepts a student or teacher and normalises the email", () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.email).toBe("riya@example.com");
    expect(
      signupSchema.safeParse({ ...valid, role: "teacher", institution: "Shivalik Institute" })
        .success,
    ).toBe(true);
  });

  it("never lets a visitor sign up as admin", () => {
    expect(signupSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("asks teachers for their institution", () => {
    const result = signupSchema.safeParse({ ...valid, role: "teacher", institution: "  " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["institution"],
      message: "Which college or institute do you teach at?",
    });
  });

  it("keeps an optional class code for students only, upper-cased", () => {
    expect(signupSchema.parse({ ...valid, joinCode: " thrm01 " }).joinCode).toBe("THRM01");
    expect(signupSchema.parse({ ...valid, joinCode: "" }).joinCode).toBeUndefined();
    expect(signupSchema.safeParse({ ...valid, joinCode: "ME204-7KQ" }).success).toBe(false);
    const teacher = signupSchema.parse({
      ...valid,
      role: "teacher",
      institution: "Shivalik Institute",
      joinCode: "THRM01",
    });
    expect(teacher.joinCode).toBeUndefined();
    expect(signupSchema.parse({ ...valid, institution: "Somewhere" }).institution).toBeUndefined();
  });
});

describe("magicLinkSchema", () => {
  it("needs a complete email", () => {
    expect(magicLinkSchema.safeParse({ email: "riya@college" }).success).toBe(false);
    expect(magicLinkSchema.parse({ email: " Riya@College.edu.in" }).email).toBe(
      "riya@college.edu.in",
    );
  });
});

describe("joinCodeSchema", () => {
  it("accepts six letters or digits", () => {
    expect(joinCodeSchema.parse("flmc02")).toBe("FLMC02");
    expect(joinCodeSchema.safeParse("FLMC0").success).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("scores 0 to 4", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("abcdefgh12")).toBe(2);
    expect(passwordStrength("Abcdefgh12!xyz")).toBe(4);
  });
});
