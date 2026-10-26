import { describe, expect, it } from "vitest";
import { inviteHtml, inviteSubject, inviteText, signupLink } from "./invite-email";

const base = {
  name: "Riya Sharma",
  email: "riya+1@demo.in",
  courseName: "Thermodynamics",
  courseCode: "ME201",
  teacherName: "Kavita Sharma",
  joinCode: "THRM01",
  siteUrl: "https://safesight.example/",
  added: false,
};

describe("invite email", () => {
  it("links to sign-up with the email and class code", () => {
    expect(signupLink("https://x.in/", "a+b@c.in", "THRM01")).toBe("https://x.in/signup?email=a%2Bb%40c.in&code=THRM01");
    const text = inviteText(base);
    expect(text).toContain("Hi Riya,");
    expect(text).toContain("https://safesight.example/signup?email=riya%2B1%40demo.in&code=THRM01");
    expect(text).toContain("class code THRM01");
    expect(inviteSubject(base)).toBe("Join ME201 · Thermodynamics on SafeSight");
  });

  it("tells an existing student they were added", () => {
    const added = { ...base, added: true };
    expect(inviteSubject(added)).toBe("You're in ME201 · Thermodynamics on SafeSight");
    expect(inviteText(added)).toContain("https://safesight.example/login");
    expect(inviteText(added)).not.toContain("/signup");
  });

  it("escapes HTML", () => {
    const html = inviteHtml({ ...base, courseName: "<b>Heat</b> & work", teacherName: 'K "Sharma"' });
    expect(html).toContain("&lt;b&gt;Heat&lt;/b&gt; &amp; work");
    expect(html).toContain("K &quot;Sharma&quot;");
    expect(html).not.toContain("<b>Heat");
  });
});
