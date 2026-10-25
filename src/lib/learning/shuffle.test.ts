import { describe, expect, it } from "vitest";
import { shuffleOptions } from "./shuffle";

describe("shuffleOptions", () => {
  it("keeps the answer pointing at the same option", () => {
    const check = { options: ["right", "b", "c", "d"], answer: 0 };
    for (let seed = 0; seed < 20; seed++) {
      let n = seed;
      const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
      const out = shuffleOptions(check, random);
      expect(out.options[out.answer]).toBe("right");
      expect([...out.options].sort()).toEqual([...check.options].sort());
    }
  });
  it("moves the answer away from the first slot", () => {
    const out = shuffleOptions({ options: ["right", "b", "c", "d"], answer: 0 }, () => 0);
    expect(out.answer).not.toBe(0);
  });
});
