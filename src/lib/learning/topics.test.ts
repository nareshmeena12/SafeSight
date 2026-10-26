import { describe, expect, it } from "vitest";
import { relatedTopics, topicKey, topicLabel } from "./topics";

describe("topicKey", () => {
  it("normalises case, punctuation and spaces", () => {
    expect(topicKey("First law: Sign  convention!")).toBe("first law sign convention");
    expect(topicKey("  Entropy (ΔS)  ")).toBe("entropy δs");
  });
  it("keeps keys short", () => {
    expect(topicKey("a ".repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe("topicLabel", () => {
  it("tidies a label for display", () => {
    expect(topicLabel("  polytropic   process work ")).toBe("Polytropic process work");
  });
});

describe("relatedTopics", () => {
  it("matches the same idea written two ways", () => {
    expect(relatedTopics("Entropy", "entropy change")).toBe(true);
    expect(relatedTopics("first law sign convention", "First law: sign convention")).toBe(true);
    expect(relatedTopics("polytropic process work", "boundary work in a polytropic process")).toBe(true);
  });
  it("keeps different ideas apart", () => {
    expect(relatedTopics("entropy change", "entropy as disorder")).toBe(false);
    expect(relatedTopics("first law", "second law")).toBe(false);
    expect(relatedTopics("", "entropy")).toBe(false);
  });
});
