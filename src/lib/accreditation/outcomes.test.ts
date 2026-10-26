import { describe, expect, it } from "vitest";
import { NBA_ENGINEERING_POS, normalisePoCode, programOutcomesSchema, sortProgramOutcomes } from "./outcomes";
import { cleanSuggestions, suggestPrompt } from "./suggest";

describe("programme outcomes", () => {
  it("normalises codes", () => {
    expect(normalisePoCode("po 3")).toBe("PO3");
    expect(normalisePoCode("PSO-1")).toBe("PSO1");
    expect(normalisePoCode("pso.02")).toBe("PSO2");
    expect(normalisePoCode("ga 1")).toBe("GA1");
  });

  it("sorts POs before PSOs, in number order", () => {
    const sorted = sortProgramOutcomes([
      { code: "PSO2", kind: "pso" as const },
      { code: "PO10", kind: "po" as const },
      { code: "PSO1", kind: "pso" as const },
      { code: "PO2", kind: "po" as const },
    ]);
    expect(sorted.map((o) => o.code)).toEqual(["PO2", "PO10", "PSO1", "PSO2"]);
  });

  it("refuses a code twice", () => {
    const out = programOutcomesSchema.safeParse([
      { code: "PO1", title: "", description: "a" },
      { code: "po 1", title: "", description: "b" },
    ]);
    expect(out.success).toBe(false);
  });

  it("ships the twelve NBA POs", () => {
    expect(NBA_ENGINEERING_POS.map((p) => p.code)).toEqual(Array.from({ length: 12 }, (_, i) => `PO${i + 1}`));
  });
});

describe("cleanSuggestions", () => {
  const cos = [
    { id: "c1", code: "CO1" },
    { id: "c2", code: "CO2" },
  ];
  const pos = [
    { id: "p1", code: "PO1" },
    { id: "s1", code: "PSO1" },
  ];
  it("keeps known codes and levels 1–3, once per pair", () => {
    const out = cleanSuggestions(
      {
        mappings: [
          { co: "CO1", po: "PO1", level: 3, why: "Applies the first law" },
          { co: "co 1", po: "po1", level: 2, why: "duplicate" },
          { co: "CO2", po: "PSO1", level: 2.4, why: "Thermal systems" },
          { co: "CO9", po: "PO1", level: 3, why: "unknown CO" },
          { co: "CO2", po: "PO1", level: 0, why: "zero" },
          { co: "CO2", po: "PO1", level: 5, why: "too high" },
        ],
      },
      cos,
      pos,
    );
    expect(out).toEqual([
      { outcomeId: "c1", programOutcomeId: "p1", level: 3, why: "Applies the first law" },
      { outcomeId: "c2", programOutcomeId: "s1", level: 2, why: "Thermal systems" },
    ]);
  });

  it("drops reasons with banned words", () => {
    const out = cleanSuggestions({ mappings: [{ co: "CO1", po: "PO1", level: 1, why: "Helps catch cheating" }] }, cos, pos);
    expect(out[0].why).toBe("");
  });

  it("lists every CO and PO in the prompt", () => {
    const p = suggestPrompt({ name: "Thermodynamics", code: "ME201" }, [{ code: "CO1", description: "Apply" }], [{ code: "PO1", title: "Engineering knowledge", description: "Apply maths" }]);
    expect(p).toContain("CO1: Apply");
    expect(p).toContain("PO1 (Engineering knowledge): Apply maths");
  });
});
