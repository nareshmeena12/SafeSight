import { describe, expect, it } from "vitest";
import { codeNamesIn, deterministicGuard, lastSafeBoundary, numbersIn, protectedNumbers, riskyWithoutModelCheck, type GuardContext } from "./guard";
import { decidePolicy } from "./policy";
import { buildSagePrompt } from "./prompt";
import { code, essay, labels, thermo } from "./test-fixtures";

const care = { counselling: "the counselling centre", helpline: "Tele-MANAS", helplineNumber: "14416" };

function ctx(home = thermo, l = labels({ intent: "answer_seeking" }), student = ""): GuardContext {
  const policy = decidePolicy({ home, matched: null, labels: l, ladderFor: () => null });
  const system = buildSagePrompt({ policy, labels: l, courseName: "Thermodynamics", courseCode: "ME201", home, studentFirstName: "Riya", passages: [], care });
  return {
    policy,
    answerKeys: [thermo.answerKey],
    teacherNotes: [thermo.teacherNotes],
    systemPrompt: system,
    visibleText: `${home.title}\n${home.instructions}\n${student}`,
    codeNames: home.kind === "code" ? codeNamesIn(home.instructions) : [],
  };
}

describe("numbers", () => {
  it("reads numbers with separators and decimals", () => {
    expect(numbersIn("W = 68.9 kJ, Q = 1,241.2 kJ and 2e3")).toEqual([68.9, 1241.2, 2000]);
  });

  it("protects answer-key values the student hasn't seen", () => {
    const n = protectedNumbers([thermo.answerKey], thermo.instructions);
    expect(n).toEqual(expect.arrayContaining([0.459, 0.918, 68.9, 600, 241.2]));
    // Given in the question: 0.287 isn't in the key, 150/27 are visible anyway.
    expect(n).not.toContain(150);
  });
});

describe("deterministicGuard", () => {
  it("passes a normal hint", () => {
    expect(deterministicGuard("Let's work through this together. What have you tried so far?", ctx()).ok).toBe(true);
  });

  it("blocks final values from the answer key, rounded or not", () => {
    for (const leak of ["So the work is 68.9 kJ.", "W ≈ 68.88 kJ", "It comes to about 241 kJ… roughly 241.2"]) {
      const r = deterministicGuard(leak, ctx());
      expect(r.ok, leak).toBe(false);
    }
  });

  it("allows values the student already wrote", () => {
    const r = deterministicGuard("Your 0.459 m³ for V1 is right. What does doubling the volume give?", ctx(thermo, labels({ intent: "attempt", attemptQuality: 0.8, sharesWorking: true }), "I got V1 = 0.459 m³"));
    expect(r.ok).toBe(true);
  });

  it("blocks wording from the answer key and the teacher's notes", () => {
    expect(deterministicGuard("Use V1 = mRT1/P = 0.4 then V2 = …", ctx()).ok).toBe(true);
    const notes = deterministicGuard("My notes say: students often mix up work done by and on the system.", ctx());
    expect(notes.ok).toBe(false);
  });

  it("blocks the system prompt", () => {
    const c = ctx();
    const leaked = c.systemPrompt.split("\n").slice(0, 4).join("\n");
    expect(deterministicGuard(leaked, c).ok).toBe(false);
  });

  it("blocks essay paragraphs but not short guidance", () => {
    const c = ctx(essay, labels({ intent: "deliverable_request" }));
    const para = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
    expect(deterministicGuard(`${para}\n\n${para}`, c).ok).toBe(false);
    expect(deterministicGuard("- Start with a hook from your kitchen\n- Define entropy in one line\n- Two examples", c).ok).toBe(true);
  });

  it("blocks full code and the function the lab asks for", () => {
    const c = ctx(code, labels({ intent: "deliverable_request" }));
    const fn = "```python\ndef newton_raphson(f, df, x0, tol=1e-6, max_iter=50):\n    x = x0\n    return x\n```";
    expect(deterministicGuard(fn, c).ok).toBe(false);
    const long = "```python\n" + Array.from({ length: 13 }, (_, i) => `x${i} = ${i}`).join("\n") + "\n```";
    expect(deterministicGuard(long, c).ok).toBe(false);
    expect(deterministicGuard("```python\nx = x - f(x) / df(x)\n```\nWhat stops the loop?", c).ok).toBe(true);
  });

  it("checks a code block that is still streaming, and the function name in any chat", () => {
    const c = ctx(code, labels({ intent: "deliverable_request" }));
    const open = "```python\n" + Array.from({ length: 13 }, (_, i) => `x${i} = ${i}`).join("\n");
    expect(deterministicGuard(open, c).ok).toBe(false);
    const explore = { ...ctx(code, labels({ intent: "concept" })), homeKind: null, policy: { kind: "explain" as const, governing: null } };
    expect(deterministicGuard("```python\ndef newton_raphson(f, df, x0):\n", explore).ok).toBe(false);
  });

  it("blocks verdicts on a bare answer", () => {
    const c = ctx(thermo, labels({ intent: "verify_answer", attemptQuality: 0.2 }));
    expect(c.policy.kind).toBe("ask_working");
    expect(deterministicGuard("Yes, that's correct!", c).ok).toBe(false);
    expect(deterministicGuard("Not quite — check again.", c).ok).toBe(false);
    expect(deterministicGuard("Could you show me your working, step by step?", c).ok).toBe(true);
  });
});

describe("helpers", () => {
  it("finds the function names a code assignment asks for", () => {
    expect(codeNamesIn(code.instructions)).toEqual(["newton_raphson"]);
  });

  it("only lets a governed draft out without the model guard if it has no new numbers or code", () => {
    expect(riskyWithoutModelCheck("What have you tried?", thermo.instructions)).toBe(false);
    expect(riskyWithoutModelCheck("Try 68.9", thermo.instructions)).toBe(true);
    expect(riskyWithoutModelCheck("Use 150 kPa", thermo.instructions)).toBe(false);
  });

  it("finds sentence boundaries for streaming without splitting decimals", () => {
    expect(lastSafeBoundary("V = 0.459 m³ is")).toBe(-1);
    expect(lastSafeBoundary("First. Then")).toBe(6);
    expect(lastSafeBoundary("Here:\n```python\nx = 1\ny = 2\n")).toBe(6);
    expect(lastSafeBoundary("Here:\n```python\nx = 1\n```\nNext")).toBe(26);
  });
});
