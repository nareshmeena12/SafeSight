import { describe, expect, it } from "vitest";
import { domainRuleMessage, domainSchema, emailAllowed, emailAtDomain, normaliseDomain } from "./domains";

describe("normaliseDomain", () => {
  it("accepts the shapes admins type", () => {
    expect(normaliseDomain("college.edu.in")).toBe("college.edu.in");
    expect(normaliseDomain(" @College.EDU.in ")).toBe("college.edu.in");
    expect(normaliseDomain("https://www.college.edu.in/admissions")).toBe("college.edu.in");
    expect(normaliseDomain("riya@students.college.edu.in")).toBe("students.college.edu.in");
  });

  it("rejects things that aren't domains", () => {
    expect(normaliseDomain("college")).toBeNull();
    expect(normaliseDomain("col lege.in")).toBeNull();
    expect(normaliseDomain("-bad.in")).toBeNull();
    expect(normaliseDomain("")).toBeNull();
  });
});

describe("emailAtDomain / emailAllowed", () => {
  it("matches the domain and its subdomains, not look-alikes", () => {
    expect(emailAtDomain("riya@college.edu.in", "college.edu.in")).toBe(true);
    expect(emailAtDomain("riya@students.college.edu.in", "college.edu.in")).toBe(true);
    expect(emailAtDomain("riya@notcollege.edu.in", "college.edu.in")).toBe(false);
    expect(emailAtDomain("riya@college.edu.in.evil.com", "college.edu.in")).toBe(false);
  });

  it("only restricts when the institution asks for it", () => {
    expect(emailAllowed("a@gmail.com", { domainsOnly: false, domains: ["college.edu.in"] })).toBe(true);
    expect(emailAllowed("a@gmail.com", { domainsOnly: true, domains: ["college.edu.in"] })).toBe(false);
    expect(emailAllowed("a@college.edu.in", { domainsOnly: true, domains: ["x.in", "college.edu.in"] })).toBe(true);
  });
});

describe("domainSchema", () => {
  it("refuses public webmail domains", () => {
    expect(domainSchema.safeParse("gmail.com").success).toBe(false);
    expect(domainSchema.safeParse("@yahoo.co.in").success).toBe(false);
    expect(domainSchema.parse("IITMandi.ac.in")).toBe("iitmandi.ac.in");
  });
});

it("names the allowed domains in the message", () => {
  expect(domainRuleMessage(["college.edu.in"])).toContain("@college.edu.in");
});
