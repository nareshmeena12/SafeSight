import { describe, expect, it } from "vitest";
import { AI_DOMAINS, fullBlocklist, isBlockedHost, normalizeDomain, parseBlocklist, siteName } from "./domains";

describe("normalizeDomain", () => {
  it("reads URLs and bare hosts", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeDomain("stackoverflow.com")).toBe("stackoverflow.com");
    expect(normalizeDomain("*.geeksforgeeks.org")).toBe("geeksforgeeks.org");
    expect(normalizeDomain("chat.example.co.in:8080")).toBe("chat.example.co.in");
  });
  it("rejects things that aren't hosts", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("not a site")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("-bad-.com")).toBeNull();
  });
});

describe("parseBlocklist", () => {
  it("splits lines and commas, drops duplicates, reports invalid entries", () => {
    expect(parseBlocklist("a.com\nwww.a.com, b.org  c")).toEqual({ domains: ["a.com", "b.org"], invalid: ["c"] });
  });
});

describe("blocking", () => {
  const list = fullBlocklist(["stackoverflow.com"]);
  it("always includes the AI list", () => {
    for (const d of ["chatgpt.com", "gemini.google.com", "claude.ai", "copilot.microsoft.com", "deepseek.com", "perplexity.ai"]) {
      expect(AI_DOMAINS).toContain(d);
      expect(list).toContain(d);
    }
    expect(list).toContain("stackoverflow.com");
  });
  it("matches subdomains but not look-alikes", () => {
    expect(isBlockedHost("chat.deepseek.com", list)).toBe(true);
    expect(isBlockedHost("CHATGPT.COM", list)).toBe(true);
    expect(isBlockedHost("notchatgpt.com", list)).toBe(false);
    expect(isBlockedHost("google.com", list)).toBe(false);
    expect(isBlockedHost("docs.python.org", list)).toBe(false);
  });
  it("names well-known sites", () => {
    expect(siteName("chatgpt.com")).toBe("ChatGPT");
    expect(siteName("www.perplexity.ai")).toBe("Perplexity");
    expect(siteName("example.org")).toBe("example.org");
  });
});
