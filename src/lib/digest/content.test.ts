import { describe, expect, it } from "vitest";
import { digestHtml, digestSubject, digestText, relianceTrendLine, type DigestContent } from "./content";

const content: DigestContent = {
  week: "2026-10-26",
  generatedAt: "2026-10-26T01:30:00Z",
  courses: [
    {
      id: "c1",
      name: "Thermodynamics",
      code: "ME201",
      enrolled: 30,
      brief: { misconceptions: [{ title: "Work as a <state> function", students: 9 }], quizReady: true },
      flags: { open: 4, high: 1, newThisWeek: 3 },
      reliance: { weeks: [{ week: "2026-09-28", avg: null }, { week: "2026-10-05", avg: 40 }, { week: "2026-10-12", avg: 42.4 }, { week: "2026-10-19", avg: 48.2 }], highBand: 2 },
    },
    {
      id: "c2",
      name: "Fluid Mechanics",
      code: "ME204",
      enrolled: 20,
      brief: null,
      flags: { open: 0, high: 0, newThisWeek: 0 },
      reliance: { weeks: [{ week: "2026-10-19", avg: null }], highBand: 0 },
    },
  ],
};

describe("digest", () => {
  it("describes the Reliance trend in words", () => {
    expect(relianceTrendLine(content.courses[0].reliance.weeks)).toBe("Average Reliance Score up 6, from 42 to 48 (medium band)");
    expect(relianceTrendLine([{ avg: 30 }, { avg: 31 }])).toBe("Average Reliance Score steady at 31 (low band)");
    expect(relianceTrendLine([{ avg: null }])).toBe("No Reliance Score yet");
  });

  it("has a subject with the week and open flags", () => {
    expect(digestSubject(content)).toBe("SafeSight · your week ahead (26 Oct) · 4 open flags");
  });

  it("text lists the brief, flags and trend per course, with links", () => {
    const text = digestText(content, "https://safesight.example/");
    expect(text).toContain("Work as a <state> function — 9 of 30 students");
    expect(text).toContain("https://safesight.example/teacher/brief?course=c1");
    expect(text).toContain("Flags: 4 open flags, 1 high priority, 3 new in the last 7 days");
    expect(text).toContain("Flags: No open flags");
    expect(text).toContain("not enough questions to Sage this week");
  });

  it("html escapes text and never uses banned words", () => {
    const html = digestHtml(content, "https://safesight.example");
    expect(html).toContain("Work as a &lt;state&gt; function");
    expect(html).not.toMatch(/cheat|catch|spy|ai-generated/i);
  });
});
