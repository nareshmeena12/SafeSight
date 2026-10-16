import { describe, expect, it } from "vitest";
import { signupSchema } from "./schemas";

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
    expect(signupSchema.safeParse({ ...valid, role: "teacher" }).success).toBe(
      true,
    );
  });

  it("never lets a visitor sign up as admin", () => {
    expect(signupSchema.safeParse({ ...valid, role: "admin" }).success).toBe(
      false,
    );
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(
      false,
    );
  });
});
