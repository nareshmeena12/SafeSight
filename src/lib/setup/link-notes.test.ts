import { describe, expect, it } from "vitest";
import { linkTopicsToNotes, stem } from "./link-notes";

const chunks = [
  { materialId: "notes", page: 3, content: "The first law of thermodynamics for a closed system: Q - W = ΔU. The first law is an energy balance." },
  { materialId: "notes", page: 7, content: "Entropy is a property. The entropy change of a system in a reversible process is dS = δQ/T." },
  { materialId: "notes", page: 12, content: "Polytropic processes follow pV^n = C. Boundary work for polytropic processes is (p2V2 - p1V1)/(1 - n)." },
  { materialId: "notes", page: 13, content: "Worked problems on boundary work and heat transfer in a system." },
  { materialId: "slides", page: 1, content: "Entropy, entropy generation and the increase of entropy principle." },
  { materialId: "slides", page: 2, content: "A system and its surroundings; the change of a system's state." },
];

describe("linkTopicsToNotes", () => {
  it("links a topic to the pages where its words appear", () => {
    const links = linkTopicsToNotes([{ id: "t1", title: "Polytropic process" }], chunks);
    expect(links).toEqual([expect.objectContaining({ topicId: "t1", materialId: "notes", pages: [12] })]);
  });

  it("ranks notes by how well they match and keeps pages in order", () => {
    const links = linkTopicsToNotes([{ id: "t2", title: "Entropy" }], chunks);
    expect(links.map((l) => l.materialId)).toEqual(["slides", "notes"]);
    expect(links[1].pages).toEqual([7]);
  });

  it("needs the rare words, not just the common ones", () => {
    // "change" and "system" are everywhere; "entropy change" must match "entropy".
    const links = linkTopicsToNotes([{ id: "t3", title: "Entropy change of a system" }], chunks);
    expect(links.every((l) => l.pages.some((p) => [1, 7].includes(p)))).toBe(true);
    expect(links.some((l) => l.pages.includes(2))).toBe(false);
  });

  it("links nothing for a topic the notes don't cover, or one made only of filler words", () => {
    expect(linkTopicsToNotes([{ id: "t4", title: "Rankine cycle" }], chunks)).toEqual([]);
    expect(linkTopicsToNotes([{ id: "t5", title: "Introduction and basic concepts" }], chunks)).toEqual([]);
  });

  it("returns nothing without notes", () => {
    expect(linkTopicsToNotes([{ id: "t1", title: "Entropy" }], [])).toEqual([]);
  });

  it("stems plurals", () => {
    expect([stem("processes"), stem("properties"), stem("cycles"), stem("analysis"), stem("gas")]).toEqual([
      "process",
      "property",
      "cycle",
      "analysis",
      "gas",
    ]);
  });
});
