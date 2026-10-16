import type { Labels } from "./labels";
import type { SageAssignment } from "./match";

/** Shared fixtures for Sage's unit tests. */

export const thermo: SageAssignment = {
  id: "00000000-0000-4000-8000-000000000201",
  courseId: "00000000-0000-4000-8000-000000000101",
  title: "Thermodynamics problem set 3",
  instructions:
    "Problem 2: A piston-cylinder device contains 0.8 kg of air at 150 kPa and 27 °C. Heat is added at constant pressure until the volume doubles. Find the boundary work and the heat transferred. (cp = 1.005 kJ/kg·K, R = 0.287 kJ/kg·K)",
  mode: "learn",
  kind: "problem",
  maxHintLevel: 4,
  workedExamples: true,
  dueAt: null,
  teacherNotes: "Students often mix up work done by and on the system. Push them to draw the system boundary first.",
  answerKey: "V1 = mRT1/P = 0.459 m³; V2 = 0.918 m³; W = P(V2 − V1) = 68.9 kJ; T2 = 600 K; Q = m cp (T2 − T1) = 241.2 kJ",
};

export const essay: SageAssignment = {
  id: "00000000-0000-4000-8000-000000000202",
  courseId: thermo.courseId,
  title: "Essay: entropy in everyday life",
  instructions: "In 600–800 words, explain entropy with two examples from daily life. Write it in Trace.",
  mode: "assist",
  kind: "essay",
  maxHintLevel: 4,
  workedExamples: true,
  dueAt: null,
  teacherNotes: "",
  answerKey: "",
};

export const code: SageAssignment = {
  id: "00000000-0000-4000-8000-000000000203",
  courseId: thermo.courseId,
  title: "Lab 4: Newton–Raphson in Python",
  instructions:
    "Write newton_raphson(f, df, x0, tol=1e-6, max_iter=50) that returns a root of f, stopping when |f(x)| < tol. Raise ValueError if df(x) == 0.",
  mode: "learn",
  kind: "code",
  maxHintLevel: 4,
  workedExamples: true,
  dueAt: null,
  teacherNotes: "",
  answerKey: "",
};

export const exam: SageAssignment = {
  ...thermo,
  id: "00000000-0000-4000-8000-000000000204",
  title: "Mid-semester test",
  instructions: "Closed-book test in class.",
  mode: "exam",
  answerKey: "",
  teacherNotes: "",
};

export function labels(over: Partial<Labels> = {}): Labels {
  return {
    intent: "concept",
    attemptQuality: 0,
    sharesWorking: false,
    claimsPermission: false,
    distress: "none",
    topic: "",
    match: { assignmentId: null, similarity: 0 },
    source: "model",
    ...over,
  };
}
