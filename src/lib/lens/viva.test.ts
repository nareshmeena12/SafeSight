import { describe, expect, it } from "vitest";
import { lensInstructions } from "./prompt";
import { cleanViva, markedText, VIVA_SYSTEM_PROMPT, vivaAsText, vivaEvidence } from "./viva-schema";
import { cleanResilience, RESILIENCE_SYSTEM_PROMPT, resilienceBand, type Resilience } from "@/lib/teacher/resilience-schema";

describe("viva questions", () => {
  it("marks pasted passages in the text Lens reads", () => {
    const html =
      '<p>Entropy rises because <span data-trace-paste="">heat flows from hot to cold &amp; never back</span>.</p><p>Second point.</p>';
    expect(markedText(html)).toBe("Entropy rises because [pasted]heat flows from hot to cold & never back[/pasted].\nSecond point.");
  });

  it("cuts very long work", () => {
    expect(markedText(`<p>${"a".repeat(9000)}</p>`, 100)).toMatch(/cut for length/);
  });

  it("names the evidence neutrally, and only when there is some", () => {
    expect(vivaEvidence({ pasteRatio: 0.05, activeMinutes: 40, finalChars: 3000, pasteSizes: [120] }).strong).toBe(false);
    const big = vivaEvidence({ pasteRatio: 0.54, activeMinutes: 30, finalChars: 3000, pasteSizes: [1600] });
    expect(big.reasons).toEqual(["about 54% of the final text was pasted"]);
    const fast = vivaEvidence({ pasteRatio: 0, activeMinutes: 2, finalChars: 4000, pasteSizes: [] });
    expect(fast.reasons[0]).toMatch(/written in 2 active minutes/);
  });

  it("rejects banned words and formats a copy", () => {
    const ok = {
      questions: [
        { question: "Why does entropy rise here?", lookFor: "Heat flows one way." },
        { question: "What changes if the process is reversible?", lookFor: "Entropy change of the universe is zero." },
        { question: "How did you get 0.43 kJ/K?", lookFor: "Q over T with T in kelvin." },
      ],
    };
    expect(cleanViva(ok)).toEqual(ok);
    expect(cleanViva({ questions: [{ ...ok.questions[0], lookFor: "Did they cheat?" }, ok.questions[1], ok.questions[2]] })).toBeNull();
    expect(vivaAsText("Entropy essay", ok.questions)).toContain("1. Why does entropy rise here?\n   A good answer shows: Heat flows one way.");
  });
});

describe("AI resilience", () => {
  const base: Resilience = {
    score: 85,
    summary: "A chatbot could solve this textbook problem.",
    reasons: ["All values are given."],
    rewrites: [
      { approach: "oral", title: "Explain in tutorial", why: "Needs the student.", instructions: "Solve it and explain step 2 to me in Friday's tutorial." },
      { approach: "reasoning", title: "Justify each step", why: "Needs reasoning.", instructions: "Solve it and say why each assumption holds for your setup." },
      { approach: "local", title: "Your own readings", why: "Needs their data.", instructions: "Measure the kettle in your hostel and use your own readings." },
    ],
  };

  it("orders the rewrites and needs one of each approach", () => {
    expect(cleanResilience(base)?.rewrites.map((r) => r.approach)).toEqual(["reasoning", "local", "oral"]);
    expect(cleanResilience({ ...base, rewrites: [base.rewrites[0], base.rewrites[0], base.rewrites[1]] })).toBeNull();
    expect(cleanResilience({ ...base, summary: "Students can catch up on this." })).toBeNull();
  });

  it("bands the score", () => {
    expect(resilienceBand(20).tone).toBe("good");
    expect(resilienceBand(55).tone).toBe("warning");
    expect(resilienceBand(90).tone).toBe("critical");
  });
});

describe("wording", () => {
  it("prompts only name the banned words to forbid them", () => {
    for (const prompt of [VIVA_SYSTEM_PROMPT, RESILIENCE_SYSTEM_PROMPT, lensInstructions({ teacherName: "Kavita", today: "1 Nov" })]) {
      const withoutRule = prompt.replace(/never use the words[^.]*\./gi, "");
      expect(/cheat|\bspy\b|ai-generated/i.test(withoutRule)).toBe(false);
    }
  });
});
