import { describe, expect, it } from "vitest";
import { essay, thermo } from "@/lib/sage/test-fixtures";
import { checkFeedback, checkPracticeItem, checkRecapText } from "./checks";

describe("checkPracticeItem", () => {
  it("accepts a new problem with its own numbers", () => {
    const item = {
      question: "A rigid tank holds 2 kg of nitrogen at 300 K. It is heated to 450 K. Find the change in internal energy (cv = 0.743 kJ/kg·K).",
      solution: "ΔU = m cv ΔT = 2 × 0.743 × 150 = 222.9 kJ",
    };
    expect(checkPracticeItem(item, [thermo, essay])).toEqual({ ok: true });
  });

  it("rejects the assignment's own problem", () => {
    const item = { question: thermo.instructions, solution: "W = P(V2 − V1)" };
    expect(checkPracticeItem(item, [thermo]).ok).toBe(false);
  });

  it("rejects a problem whose solution reveals an answer-key value", () => {
    const item = {
      question: "Air is heated at constant pressure in a cylinder; the work done is needed.",
      solution: "So the work is 68.9 kJ.",
    };
    expect(checkPracticeItem(item, [thermo])).toMatchObject({ ok: false });
  });

  it("rejects banned words", () => {
    expect(checkPracticeItem({ question: "How do teachers catch copying?", solution: "…" }, []).ok).toBe(false);
  });
});

describe("checkRecapText", () => {
  const chat = "Student: I got W = 40 kJ for the 200 kPa case. Sage: Your first line is right.";
  it("allows what the chat covered", () => {
    expect(checkRecapText("You found boundary work at 200 kPa is P times the change in volume.", chat, [thermo.answerKey]).ok).toBe(true);
  });
  it("rejects numbers the chat never had", () => {
    expect(checkRecapText("The heat added is 241.2 kJ.", chat, [thermo.answerKey]).ok).toBe(false);
    expect(checkRecapText("The volume becomes 0.918 m³.", chat, [])).toMatchObject({ ok: false });
  });
  it("rejects code", () => {
    expect(checkRecapText("```python\nprint(1)\n```", chat, []).ok).toBe(false);
  });
});

describe("checkFeedback", () => {
  it("rejects answer-key values the student didn't write", () => {
    expect(checkFeedback("You should get 68.9 kJ.", "my answer", [thermo.answerKey]).ok).toBe(false);
    expect(checkFeedback("Your 68.9 kJ is the right size.", "I got 68.9 kJ", [thermo.answerKey]).ok).toBe(true);
  });
});
