import { describe, expect, it } from "vitest";
import {
  canAccess,
  homeForRole,
  isProtectedPath,
  redirectAfterLogin,
} from "./roles";

describe("homeForRole", () => {
  it("sends students to /student and teachers and admins to /teacher", () => {
    expect(homeForRole("student")).toBe("/student");
    expect(homeForRole("teacher")).toBe("/teacher");
    expect(homeForRole("admin")).toBe("/teacher");
  });
});

describe("isProtectedPath", () => {
  it("protects the student and teacher apps only", () => {
    expect(isProtectedPath("/student")).toBe(true);
    expect(isProtectedPath("/student/sage/abc")).toBe(true);
    expect(isProtectedPath("/teacher/flags")).toBe(true);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/students-guide")).toBe(false);
  });
});

describe("canAccess", () => {
  it("keeps each role in its own area", () => {
    expect(canAccess("/student", "student")).toBe(true);
    expect(canAccess("/teacher", "student")).toBe(false);
    expect(canAccess("/student", "teacher")).toBe(false);
    expect(canAccess("/teacher/students", "teacher")).toBe(true);
    expect(canAccess("/teacher", "admin")).toBe(true);
    expect(canAccess("/", "student")).toBe(true);
  });
});

describe("redirectAfterLogin", () => {
  it("honours a next path the role can open", () => {
    expect(redirectAfterLogin("student", "/student/sage/a1")).toBe(
      "/student/sage/a1",
    );
  });

  it("falls back to home for missing, foreign or unsafe next paths", () => {
    expect(redirectAfterLogin("student", null)).toBe("/student");
    expect(redirectAfterLogin("student", "/teacher")).toBe("/student");
    expect(redirectAfterLogin("teacher", "//evil.example")).toBe("/teacher");
    expect(redirectAfterLogin("teacher", "https://evil.example")).toBe(
      "/teacher",
    );
    expect(redirectAfterLogin("teacher", "/\\evil.example")).toBe("/teacher");
    expect(redirectAfterLogin("teacher", "/login")).toBe("/teacher");
  });
});
