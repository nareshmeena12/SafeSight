import { describe, expect, it } from "vitest";
import type { Labels } from "./labels";
import { buildSagePrompt, classifierPrompt, examModeReply } from "./prompt";

const labels: Labels = {
  intent: "answer_seeking",
  attempted: false,
  sharesSolution: false,
  instructionOverride: false,
  distress: "none",
  topic: "",
};
const input = {
  mode: "learn" as const,
  courseName: "Thermodynamics",
  courseCode: "ME201",
  assignmentTitle: "Thermodynamics problem set 3",
  instructions: "Solve problems 1–6.",
  teacherNotes: "Push them to draw the system boundary first.",
  hintLevel: 1 as const,
  labels,
  studentFirstName: "Riya",
  hasMaterials: true,
  care: { counselling: "the counselling centre", helpline: "Tele-MANAS", helplineNumber: "14416" },
};

const banned = /cheat|catch|spy|ai-generated/i;

describe("buildSagePrompt", () => {
  it("states the mode rule and the current ladder step", () => {
    const p = buildSagePrompt(input);
    expect(p).toContain("LEARN mode");
    expect(p).toContain("Never give the final answer");
    expect(p).toContain("Your step for THIS reply is 1");
    expect(p).toContain("search_course_material");
  });

  it("keeps teacher notes in a private section", () => {
    const p = buildSagePrompt(input);
    expect(p).toContain("Private guidance from the teacher");
    expect(p).toContain("never quote it");
    expect(buildSagePrompt({ ...input, teacherNotes: "" })).not.toContain("Private guidance");
  });

  it("adds the care protocol for distress", () => {
    const p = buildSagePrompt({ ...input, hintLevel: null, labels: { ...labels, intent: "distress", distress: "high" } });
    expect(p).toContain("14416");
    expect(p).not.toContain("Hint ladder");
  });

  it("never uses banned words", () => {
    for (const mode of ["learn", "assist", "exam"] as const) {
      for (const l of [labels, { ...labels, instructionOverride: true, distress: "high" as const, intent: "off_topic" as const }]) {
        expect(buildSagePrompt({ ...input, mode, labels: l })).not.toMatch(banned);
      }
      expect(classifierPrompt("{}", mode)).not.toMatch(banned);
    }
    expect(examModeReply("Mid-semester test")).not.toMatch(banned);
  });
});
