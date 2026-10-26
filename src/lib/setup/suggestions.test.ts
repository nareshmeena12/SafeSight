import { describe, expect, it } from "vitest";
import { setupDone, setupSteps } from "./checklist";
import { cleanSuggestions, readSuggestions, suggestPrompt } from "./suggestions";

const map = {
  units: [
    { title: "Basics", topics: ["First law"] },
    { title: "Entropy", topics: ["Entropy change"] },
  ],
  outcomes: [{ code: "CO1", description: "Apply the first law" }],
};

let n = 0;
const newId = () => `s${++n}`;

const s = (over: Partial<{ unit: number; title: string; instructions: string; aiMode: "learn" | "assist" | "exam"; why: string; outcomes: string[] }>) => ({
  unit: 1,
  title: "Problem set: first law",
  instructions: "Solve the four problems and show each step of your energy balance.",
  aiMode: "learn" as const,
  why: "Numericals are learnt by doing them",
  outcomes: ["co 1", "CO9"],
  ...over,
});

describe("cleanSuggestions", () => {
  it("keeps valid suggestions, maps units, filters unknown outcome codes", () => {
    const out = cleanSuggestions({ suggestions: [s({})] }, map, newId);
    expect(out).toEqual([
      expect.objectContaining({ unit: 0, unitTitle: "Basics", outcomes: ["CO1"], status: "new", why: "Numericals are learnt by doing them." }),
    ]);
  });

  it("drops bad units, duplicates, banned words, too-short instructions and a third per unit", () => {
    const out = cleanSuggestions(
      {
        suggestions: [
          s({ unit: 0 }),
          s({ unit: 3 }),
          s({ unit: 2, title: "Entropy essay" }),
          s({ unit: 2, title: "Entropy essay" }),
          s({ unit: 2, title: "Lab", instructions: "Too short." }),
          s({ unit: 2, title: "Quiz", why: "So you can catch students" }),
          s({ unit: 2, title: "Second", aiMode: "assist" }),
          s({ unit: 2, title: "Third" }),
        ],
      },
      map,
      newId,
    );
    expect(out.map((x) => x.title)).toEqual(["Entropy essay", "Second"]);
  });

  it("reads stored suggestions and skips malformed ones", () => {
    const good = cleanSuggestions({ suggestions: [s({})] }, map, newId)[0];
    expect(readSuggestions([good, { id: 1 }, null])).toEqual([good]);
    expect(readSuggestions("nope")).toEqual([]);
  });

  it("lists units, topics and outcomes in the prompt", () => {
    const prompt = suggestPrompt("Thermodynamics", map);
    expect(prompt).toContain("Unit 2: Entropy\n  - Entropy change");
    expect(prompt).toContain("CO1: Apply the first law");
  });
});

describe("setupSteps", () => {
  it("marks steps done from counts", () => {
    const steps = setupSteps("c1", { topics: 12, notes: 0, assignments: 1, students: 0, invites: 3 });
    expect(steps.map((x) => [x.key, x.done])).toEqual([
      ["syllabus", true],
      ["notes", false],
      ["assignment", true],
      ["students", true],
    ]);
    expect(setupDone(steps)).toBe(3);
    expect(steps[0].href).toBe("/teacher/courses/c1/setup");
  });
});
