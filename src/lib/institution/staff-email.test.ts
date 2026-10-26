import { describe, expect, it } from "vitest";
import { staffInviteHtml, staffInviteSubject, staffInviteText, staffSignupLink } from "./staff-email";

const input = {
  name: "Kavita Sharma",
  email: "kavita@college.edu.in",
  role: "teacher" as const,
  institutionName: "Shivalik Institute <of> Technology",
  invitedBy: "Arjun Mehta",
  siteUrl: "https://safesight.example/",
  sso: { google: true, microsoft: false },
};

describe("staff invite email", () => {
  it("links to sign-up with the email, teacher role and institution filled in", () => {
    const url = new URL(staffSignupLink(input));
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("email")).toBe("kavita@college.edu.in");
    expect(url.searchParams.get("role")).toBe("teacher");
    expect(url.searchParams.get("institution")).toBe("Shivalik Institute <of> Technology");
  });

  it("names who invited them and the one-click sign-ins that are on", () => {
    const text = staffInviteText(input);
    expect(text).toContain("Hi Kavita,");
    expect(text).toContain("Arjun Mehta has invited you");
    expect(text).toContain("Continue with Google");
    expect(text).not.toContain("Microsoft");
    expect(staffInviteSubject({ ...input, role: "admin" })).toContain("as an admin");
  });

  it("escapes HTML", () => {
    const html = staffInviteHtml(input);
    expect(html).toContain("Shivalik Institute &lt;of&gt; Technology");
    expect(html).not.toContain("<of>");
  });
});
