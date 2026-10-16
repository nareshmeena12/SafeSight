import { describe, expect, it } from "vitest";
import { relianceBand } from "./reliance";

describe("relianceBand", () => {
  it("splits the 0–100 score into three bands", () => {
    expect(relianceBand(0)).toBe("low");
    expect(relianceBand(39.9)).toBe("low");
    expect(relianceBand(40)).toBe("medium");
    expect(relianceBand(69)).toBe("medium");
    expect(relianceBand(70)).toBe("high");
    expect(relianceBand(100)).toBe("high");
  });
});
