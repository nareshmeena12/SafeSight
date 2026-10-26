import { describe, expect, it } from "vitest";
import { teacherInviteHtml, teacherInviteSubject, teacherInviteText, teacherSignupLink } from "./invite-email";
import { parseTeacherInvites, policySchema } from "./schemas";
import { usesBannedWords } from "@/lib/trace/summary";

describe("parseTeacherInvites", () => {
  it("reads emails, names and both list styles", () => {
    const { invites, invalid } = parseTeacherInvites(
      ["kavita.sharma@college.edu", "Arjun Mehta <ARJUN@college.edu>", "Sneha Iyer, sneha@college.edu", "meera@college.edu, Meera Pillai; not an email", "kavita.sharma@college.edu"].join("\n"),
    );
    expect(invites).toEqual([
      { name: "", email: "kavita.sharma@college.edu" },
      { name: "Arjun Mehta", email: "arjun@college.edu" },
      { name: "Sneha Iyer", email: "sneha@college.edu" },
      { name: "Meera Pillai", email: "meera@college.edu" },
    ]);
    expect(invalid).toEqual(["not an email"]);
  });

  it("ignores blank lines", () => {
    expect(parseTeacherInvites("\n\n  \n").invites).toEqual([]);
  });
});

describe("policySchema", () => {
  const form = (entries: [string, string][]) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = k === "allowedModes" ? [...((out[k] as string[]) ?? []), v] : v;
    return out;
  };

  it("reads a policy form", () => {
    const parsed = policySchema.parse(
      form([
        ["departmentId", ""],
        ["allowedModes", "exam"],
        ["allowedModes", "learn"],
        ["defaultMode", "learn"],
        ["maxHintLevel", "3"],
        ["labModeAllowed", "on"],
      ]),
    );
    expect(parsed).toEqual({
      departmentId: null,
      allowedModes: ["learn", "exam"],
      defaultMode: "learn",
      maxHintLevel: 3,
      workedExamples: false,
      labModeAllowed: true,
      teachersCanLoosen: false,
    });
  });

  it("needs the default mode to be allowed and at least one mode", () => {
    const bad = policySchema.safeParse(form([["allowedModes", "exam"], ["defaultMode", "learn"], ["maxHintLevel", "2"]]));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["defaultMode"]);
    expect(policySchema.safeParse({ allowedModes: [], defaultMode: "learn", maxHintLevel: "2" }).success).toBe(false);
  });
});

describe("teacher invite email", () => {
  const input = {
    name: "Sneha Iyer",
    email: "sneha@college.edu",
    institutionName: "Shivalik Institute of Technology",
    departmentName: "Mechanical",
    adminName: "Arjun Mehta",
    siteUrl: "https://safesight.in/",
    added: false,
  };

  it("links to sign-up as a teacher with the email filled in", () => {
    expect(teacherSignupLink(input.siteUrl, input.email, "Shivalik IT")).toBe(
      "https://safesight.in/signup?email=sneha%40college.edu&role=teacher&institution=Shivalik+IT",
    );
    const text = teacherInviteText(input);
    expect(text).toContain("Hi Sneha,");
    expect(text).toContain("the Mechanical department at Shivalik Institute of Technology");
    expect(text).toContain("https://safesight.in/signup?email=sneha%40college.edu&role=teacher&institution=Shivalik+Institute+of+Technology");
    expect(teacherInviteSubject(input)).toBe("Join Shivalik Institute of Technology on SafeSight");
  });

  it("tells an existing account to log in", () => {
    const text = teacherInviteText({ ...input, added: true });
    expect(text).toContain("https://safesight.in/login");
    expect(text).not.toContain("signup");
  });

  it("escapes names in the HTML and stays neutral", () => {
    const html = teacherInviteHtml({ ...input, adminName: "<b>Arjun</b>" });
    expect(html).toContain("&lt;b&gt;Arjun&lt;/b&gt;");
    expect(usesBannedWords(teacherInviteText(input))).toBe(false);
  });
});
