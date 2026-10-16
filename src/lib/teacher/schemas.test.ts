import { describe, expect, it } from "vitest";
import { assignmentSchema, courseSchema, optionalCourseIdSchema, toDateTimeLocal } from "./schemas";

const courseId = "00000000-0000-4000-8000-000000000101";

describe("courseSchema", () => {
  it("trims and upper-cases the code", () => {
    expect(courseSchema.parse({ name: " Thermodynamics ", code: " me201 " })).toEqual({
      name: "Thermodynamics",
      code: "ME201",
    });
  });
  it("needs a name", () => {
    expect(courseSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("assignmentSchema", () => {
  it("reads datetime-local values as India time", () => {
    const parsed = assignmentSchema.parse({
      courseId,
      title: "Problem set 3",
      aiMode: "learn",
      dueAt: "2026-10-20T17:00",
    });
    expect(parsed.dueAt).toBe("2026-10-20T11:30:00.000Z");
    expect(parsed.instructions).toBe("");
    expect(toDateTimeLocal(parsed.dueAt)).toBe("2026-10-20T17:00");
  });
  it("allows no due date", () => {
    expect(assignmentSchema.parse({ courseId, title: "Essay", aiMode: "assist", dueAt: "" }).dueAt).toBeNull();
  });
  it("rejects an unknown AI mode and a bad date", () => {
    expect(assignmentSchema.safeParse({ courseId, title: "Essay", aiMode: "free" }).success).toBe(false);
    expect(assignmentSchema.safeParse({ courseId, title: "Essay", aiMode: "exam", dueAt: "soon" }).success).toBe(false);
  });
});

describe("optionalCourseIdSchema", () => {
  it("treats an empty value as all courses", () => {
    expect(optionalCourseIdSchema.parse({ courseId: "" }).courseId).toBeNull();
    expect(optionalCourseIdSchema.parse({ courseId }).courseId).toBe(courseId);
  });
});
