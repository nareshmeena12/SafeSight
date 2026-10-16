import { describe, expect, it } from "vitest";
import { isActive, navigation } from "./nav";

describe("isActive", () => {
  it("matches the area root only exactly", () => {
    expect(isActive("/teacher", "/teacher", "/teacher")).toBe(true);
    expect(isActive("/teacher/courses", "/teacher", "/teacher")).toBe(false);
  });

  it("matches a section and its children", () => {
    expect(isActive("/teacher/courses", "/teacher/courses", "/teacher")).toBe(true);
    expect(isActive("/teacher/courses/abc", "/teacher/courses", "/teacher")).toBe(true);
    expect(isActive("/teacher/coursesx", "/teacher/courses", "/teacher")).toBe(false);
  });
});

describe("navigation", () => {
  it("keeps every link inside its own area", () => {
    for (const [area, { items }] of Object.entries(navigation)) {
      for (const item of items) expect(item.href.startsWith(`/${area}`)).toBe(true);
    }
  });
});
