import { describe, expect, it } from "vitest";
import {
  canAccess,
  homeForRole,
  isProtectedPath,
  redirectAfterLogin,
} from "./roles";

describe("homeForRole", () => {
  it("sends students to /student, teachers to /teacher and admins to /admin", () => {
    expect(homeForRole("student")).toBe("/student");
    expect(homeForRole("teacher")).toBe("/teacher");
    expect(homeForRole("admin")).toBe("/admin");
  });
});

describe("isProtectedPath", () => {
  it("protects the student and teacher apps only", () => {
    expect(isProtectedPath("/student")).toBe(true);
    expect(isProtectedPath("/student/sage/abc")).toBe(true);
    expect(isProtectedPath("/teacher/flags")).toBe(true);
    expect(isProtectedPath("/admin/departments")).toBe(true);
    expect(isProtectedPath("/administration")).toBe(false);
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
    expect(canAccess("/admin", "admin")).toBe(true);
    expect(canAccess("/admin/policy", "teacher")).toBe(false);
    expect(canAccess("/admin", "student")).toBe(false);
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
    expect(redirectAfterLogin("teacher", "/admin")).toBe("/teacher");
    expect(redirectAfterLogin("admin", "/teacher/courses")).toBe("/teacher/courses");
  });
});
