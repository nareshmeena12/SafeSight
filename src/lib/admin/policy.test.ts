import { describe, expect, it } from "vitest";
import {
  assignmentDefaults,
  describePolicy,
  isAtLeastAsStrict,
  listModes,
  openPolicy,
  policyProblemFromDbError,
  policyProblems,
  policySource,
  problemMessage,
  type AiPolicy,
} from "./policy";

const strict: AiPolicy = {
  allowedModes: ["learn", "exam"],
  defaultMode: "learn",
  maxHintLevel: 2,
  workedExamples: false,
  labModeAllowed: false,
  teachersCanLoosen: false,
};

describe("assignmentDefaults", () => {
  it("starts new assignments from the policy", () => {
    expect(assignmentDefaults(strict)).toEqual({ aiMode: "learn", maxHintLevel: 2, workedExamples: false });
    expect(assignmentDefaults({ ...strict, defaultMode: "exam" }).aiMode).toBe("exam");
  });

  it("keeps today's defaults without a policy", () => {
    expect(assignmentDefaults(null)).toEqual({ aiMode: "learn", maxHintLevel: 4, workedExamples: true });
  });
});

describe("policyProblems", () => {
  it("allows anything without a policy or when teachers may loosen it", () => {
    const loose = { aiMode: "assist" as const, maxHintLevel: 4, workedExamples: true };
    expect(policyProblems(null, loose)).toEqual([]);
    expect(policyProblems({ ...strict, teachersCanLoosen: true }, loose)).toEqual([]);
  });

  it("finds every looser setting on a new assignment", () => {
    expect(policyProblems(strict, { aiMode: "assist", maxHintLevel: 4, workedExamples: true })).toEqual([
      "mode",
      "hint",
      "examples",
    ]);
  });

  it("lets teachers be stricter", () => {
    expect(policyProblems(strict, { aiMode: "learn", maxHintLevel: 1, workedExamples: false })).toEqual([]);
  });

  it("ignores hint settings in Exam mode", () => {
    expect(policyProblems(strict, { aiMode: "exam", maxHintLevel: 4, workedExamples: true })).toEqual([]);
  });

  it("only checks what changed on an edit", () => {
    const old = { aiMode: "assist" as const, maxHintLevel: 4, workedExamples: true };
    expect(policyProblems(strict, old, old)).toEqual([]);
    expect(policyProblems(strict, { ...old, maxHintLevel: 3 }, old)).toEqual(["hint"]);
    // Leaving Exam mode re-checks the hint settings.
    const exam = { aiMode: "exam" as const, maxHintLevel: 4, workedExamples: false };
    expect(policyProblems(strict, { ...exam, aiMode: "learn" }, exam)).toEqual(["hint"]);
  });
});

describe("messages", () => {
  it("names whose policy it is", () => {
    expect(policySource({ scope: "department", departmentName: "Mechanical" })).toBe("The Mechanical AI policy");
    expect(policySource({ scope: "college", departmentName: "" })).toBe("Your college's AI policy");
    expect(policySource(null)).toBe("Your college's AI policy");
    expect(problemMessage("mode", strict, "The Mechanical AI policy")).toBe(
      "The Mechanical AI policy allows Learn and Exam for assignments. Choose one of those.",
    );
    expect(problemMessage("hint", strict, "X")).toContain("hint step 2");
  });

  it("lists modes in a fixed order", () => {
    expect(listModes(["exam", "learn"])).toBe("Learn and Exam");
    expect(listModes(["assist", "exam", "learn"])).toBe("Learn, Assist and Exam");
    expect(listModes(["exam"])).toBe("Exam");
  });

  it("describes a policy in plain lines", () => {
    expect(describePolicy(strict)).toEqual([
      "Modes: Learn and Exam (new assignments start in Learn)",
      "Highest hint step: 2",
      "Worked examples: off",
      "Lab Mode: not allowed",
      "Teachers can only be stricter",
    ]);
  });
});

describe("policyProblemFromDbError", () => {
  it("reads the trigger's hint", () => {
    expect(policyProblemFromDbError({ message: "ai_policy: hint step 4 is above 2", hint: "ai_policy_hint" })).toBe("hint");
    expect(policyProblemFromDbError({ message: "ai_policy: Lab Mode is off", hint: "ai_policy_lab" })).toBe("lab");
    expect(policyProblemFromDbError({ message: "duplicate key" })).toBeNull();
    expect(policyProblemFromDbError(null)).toBeNull();
  });
});

describe("isAtLeastAsStrict", () => {
  it("compares every setting", () => {
    expect(isAtLeastAsStrict(strict, openPolicy)).toBe(true);
    expect(isAtLeastAsStrict(openPolicy, strict)).toBe(false);
    expect(isAtLeastAsStrict({ ...strict, maxHintLevel: 3 }, { ...strict, allowedModes: ["learn", "assist", "exam"] })).toBe(false);
  });
});
