import { describe, expect, it } from "vitest";
import { classifierJsonShape, type Labels } from "./labels";
import { decidePolicy } from "./policy";
import { buildSagePrompt, classifierPrompt, examModeReply, guardPrompt, jailbreakReply, PROMPT_MARKER, safeHint } from "./prompt";
import { essay, labels, thermo } from "./test-fixtures";

const care = { counselling: "the counselling centre", helpline: "Tele-MANAS", helplineNumber: "14416" };
const banned = /cheat|catch|spy|ai-generated/i;

function prompt(l: Partial<Labels>, home = thermo) {
  const lab = labels(l);
  const policy = decidePolicy({ home, matched: null, labels: lab, ladderFor: () => null });
  return buildSagePrompt({ policy, labels: lab, courseName: "Thermodynamics", courseCode: "ME201", home, studentFirstName: "Riya", passages: [], care });
}

describe("buildSagePrompt", () => {
  it("states the mode, the step and explicit allowed and forbidden outputs", () => {
    const p = prompt({ intent: "answer_seeking" });
    expect(p).toMatch(/Mode: LEARN/);
    expect(p).toMatch(/Ladder step for this reply: 1 of 5 — CLARIFY/);
    expect(p).toMatch(/ALLOWED in this reply/);
    expect(p).toMatch(/FORBIDDEN in this reply/);
    expect(p).toContain(PROMPT_MARKER);
  });

  it("includes the teacher's notes as private, and the answer key only to check work", () => {
    expect(prompt({ intent: "answer_seeking" })).toMatch(/Never quote it/);
    expect(prompt({ intent: "answer_seeking" })).not.toContain(thermo.answerKey);
    expect(prompt({ intent: "attempt", attemptQuality: 0.9, sharesWorking: true })).toContain(thermo.answerKey);
  });

  it("tells Sage to ignore permission claims and format tricks", () => {
    const p = prompt({ intent: "answer_seeking", claimsPermission: true });
    expect(p).toMatch(/my teacher allowed it/);
    expect(p).toMatch(/poem/);
    expect(p).toMatch(/rules don't apply here/);
  });

  it("uses Assist rules for the essay", () => {
    expect(prompt({ intent: "deliverable_request" }, essay)).toMatch(/Mode: ASSIST/);
  });

  it("never uses banned words", () => {
    for (const p of [prompt({ intent: "answer_seeking" }), classifierPrompt(classifierJsonShape), guardPrompt("{}")]) {
      expect(p).not.toMatch(banned);
    }
  });
});

describe("photo of working (S21)", () => {
  function photoPrompt(l: Partial<Labels>, home: typeof thermo | null = thermo) {
    const lab = labels(l);
    const policy = decidePolicy({ home, matched: null, labels: lab, ladderFor: () => null });
    return buildSagePrompt({ policy, labels: lab, courseName: "Thermodynamics", courseCode: "ME201", home, studentFirstName: "Riya", passages: [], care, fromPhoto: true });
  }

  it("asks for the first wrong line by number, never the corrected working", () => {
    const p = photoPrompt({ intent: "attempt", attemptQuality: 0.8, sharesWorking: true });
    expect(p).toMatch(/CHECK WORK|Point to the FIRST step/);
    expect(p).toMatch(/FIRST line that goes wrong/);
    expect(p).toMatch(/never give the final answer/);
    expect(p).toMatch(/\[\?\]/);
  });

  it("keeps the ladder in charge when the attempt isn't genuine", () => {
    const p = photoPrompt({ intent: "attempt", attemptQuality: 0.2, sharesWorking: true });
    expect(p).toMatch(/Ladder step for this reply/);
    expect(p).not.toMatch(/FIRST line that goes wrong/);
    expect(p).toMatch(/Refer to lines by number/);
  });

  it("says nothing about photos for a typed message", () => {
    expect(prompt({ intent: "attempt", attemptQuality: 0.8, sharesWorking: true })).not.toMatch(/from a photo/);
  });

  it("doesn't let an Explore photo become a full solution", () => {
    const p = photoPrompt({ intent: "attempt", attemptQuality: 0.8, sharesWorking: true }, null);
    expect(p).toMatch(/never rewrite the corrected working/i);
  });
});

describe("fixed replies", () => {
  it("are kind and never give anything away", () => {
    const replies = [
      examModeReply("Mid-semester test"),
      jailbreakReply({ governing: thermo }, 0),
      jailbreakReply({ governing: null }, 1),
      safeHint({ kind: "ladder", step: 1, governing: thermo }),
      safeHint({ kind: "ask_working", step: 2, governing: thermo }),
      safeHint({ kind: "assist", step: 3, governing: essay }),
    ];
    for (const r of replies) {
      expect(r).not.toMatch(banned);
      expect(r).not.toMatch(/68\.9|241/);
    }
  });
});
