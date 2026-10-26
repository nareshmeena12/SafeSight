import { describe, expect, it } from "vitest";
import { classroomCourseLabel, classroomRoster, moodleParams, moodleRoster, moodleTeaches, type MoodleUser } from "./lms";

describe("classroomRoster", () => {
  it("maps names and emails, skips students whose email is hidden, dedupes", () => {
    const { rows, warnings } = classroomRoster([
      { userId: "1", profile: { name: { fullName: "Riya Sharma" }, emailAddress: "Riya@College.edu.in" } },
      { userId: "2", profile: { name: { fullName: "Arjun Mehta" } } },
      { userId: "3", profile: { name: { fullName: "Riya again" }, emailAddress: "riya@college.edu.in" } },
    ]);
    expect(rows).toEqual([{ line: 1, name: "Riya Sharma", email: "riya@college.edu.in", rollNumber: null }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Arjun Mehta");
  });

  it("labels a course with its section", () => {
    expect(classroomCourseLabel({ name: "Thermodynamics", section: "Section A" })).toBe("Thermodynamics · Section A");
    expect(classroomCourseLabel({ name: "Fluids" })).toBe("Fluids");
  });
});

describe("moodle", () => {
  const users: MoodleUser[] = [
    { id: 2, fullname: "Kavita Sharma", email: "kavita@college.edu.in", roles: [{ shortname: "editingteacher" }] },
    { id: 7, fullname: "Riya Sharma", email: "riya@college.edu.in", idnumber: "me23b001", roles: [{ shortname: "student" }] },
    { id: 8, fullname: "Arjun Mehta", email: "arjun@college.edu.in", idnumber: "bad id!", roles: [{ shortname: "student" }] },
    { id: 9, fullname: "Guest", email: "guest@college.edu.in", roles: [] },
  ];

  it("keeps students only and reads the ID number as the roll number", () => {
    const { rows } = moodleRoster(users);
    expect(rows).toEqual([
      { line: 1, name: "Riya Sharma", email: "riya@college.edu.in", rollNumber: "ME23B001" },
      { line: 2, name: "Arjun Mehta", email: "arjun@college.edu.in", rollNumber: null },
    ]);
  });

  it("checks the teacher's own course role", () => {
    expect(moodleTeaches(users, 2)).toBe(true);
    expect(moodleTeaches(users, 7)).toBe(false);
    expect(moodleTeaches(users, 99)).toBe(false);
  });

  it("flattens parameters the way Moodle's REST server reads them", () => {
    const p = moodleParams("core_user_get_users_by_field", { field: "email", values: ["a@b.in"], options: [{ name: "x", value: 1 }] }, "tok");
    expect(p.get("wstoken")).toBe("tok");
    expect(p.get("wsfunction")).toBe("core_user_get_users_by_field");
    expect(p.get("moodlewsrestformat")).toBe("json");
    expect(p.get("values[0]")).toBe("a@b.in");
    expect(p.get("options[0][name]")).toBe("x");
    expect(p.get("options[0][value]")).toBe("1");
  });
});
