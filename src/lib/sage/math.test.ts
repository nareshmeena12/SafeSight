import { describe, expect, it } from "vitest";
import { normalizeMath } from "./math";

describe("normalizeMath", () => {
  it("converts LaTeX delimiters", () => {
    expect(normalizeMath("Use \\(Q - W = \\Delta U\\).")).toBe("Use $Q - W = \\Delta U$.");
    expect(normalizeMath("\\[ W = P\\Delta V \\]")).toContain("$$\nW = P\\Delta V\n$$");
  });

  it("leaves code alone", () => {
    const code = "```python\nprint('\\(x\\)')\n```";
    expect(normalizeMath(code)).toBe(code);
    expect(normalizeMath("`\\(x\\)` and \\(y\\)")).toBe("`\\(x\\)` and $y$");
  });
});
