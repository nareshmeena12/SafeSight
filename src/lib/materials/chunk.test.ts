import { describe, expect, it } from "vitest";
import { chunkPages, cleanPageText, CHUNK_MAX_CHARS } from "./chunk";

const sentence = "The first law of thermodynamics states that energy is conserved in a closed system. ";

describe("chunkPages", () => {
  it("keeps page numbers and never crosses a page", () => {
    const chunks = chunkPages([sentence.repeat(3), sentence.repeat(2)]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
  });

  it("splits long pages into chunks of at most ~500 tokens", () => {
    const chunks = chunkPages([sentence.repeat(80)]);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(c.page).toBe(1);
      expect(c.content.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
    // Nothing is lost.
    expect(chunks.map((c) => c.content).join(" ").replace(/\s+/g, " ").length).toBeGreaterThan(sentence.length * 79);
  });

  it("drops empty and number-only pages", () => {
    expect(chunkPages(["", "  12  ", sentence])).toEqual([{ page: 3, content: sentence.trim() }]);
  });

  it("handles a single huge word", () => {
    const chunks = chunkPages(["x".repeat(CHUNK_MAX_CHARS * 2 + 10)]);
    expect(chunks.every((c) => c.content.length <= CHUNK_MAX_CHARS)).toBe(true);
  });
});

describe("cleanPageText", () => {
  it("joins wrapped lines and hyphenated words, keeps paragraphs", () => {
    expect(cleanPageText("thermo-\ndynamics is\nfun\n\nNext   para")).toBe("thermodynamics is fun\n\nNext para");
  });
});
