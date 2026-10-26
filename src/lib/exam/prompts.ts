import type { SageAssignment } from "@/lib/sage/match";

/**
 * Prompts for exam prep (structured JSON; the shape is spelled out for
 * json_object mode). Mock tests are practice: every prompt that writes
 * questions lists the active graded assignments to stay away from, and the
 * output is checked in code as well.
 */

const voice =
  "You are Sage, a warm, plain-spoken tutor in SafeSight for college students in India. Use Markdown; maths in LaTeX with $…$ inline and $$…$$ for display; SI units.";

type Graded = Pick<SageAssignment, "title" | "instructions">;
type Passage = { title: string; page: number | null; content: string };

function avoidList(assignments: Graded[]) {
  if (!assignments.length) return "(none)";
  return assignments
    .slice(0, 12)
    .map((a, i) => `G${i + 1}: "${a.title}" — ${a.instructions.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
}

function notes(passages: Passage[]) {
  return passages.length
    ? passages.map((p) => `[${p.title}${p.page ? `, p. ${p.page}` : ""}] ${p.content.replace(/\s+/g, " ").slice(0, 900)}`).join("\n")
    : "(no notes found — write standard questions at the level of a second-year engineering course)";
}

// ------------------------------------------------------------- topics from notes

export function noteTopicsSystem(jsonShape: string) {
  return `You read excerpts of a college course's lecture notes and list the TOPICS a student should revise for the exam.

- 6–14 topics, in the order the notes teach them.
- Each title is 2–6 words, the way a syllabus would name it ("Polytropic processes", "Entropy change of an ideal gas"). No numbering, no "Introduction", no "Summary", no admin topics.
- "ref" is the excerpt (P1, P2, …) where the topic is taught.

Reply with only a JSON object of this shape:
${jsonShape}`;
}

export function noteTopicsPrompt({ course, excerpts }: { course: string; excerpts: { ref: string; title: string; page: number | null; text: string }[] }) {
  return `COURSE: ${course}

EXCERPTS:
${excerpts.map((e) => `${e.ref} [${e.title}${e.page ? `, p. ${e.page}` : ""}] ${e.text}`).join("\n")}`;
}

// ------------------------------------------------------------- mock tests

const mockRules = (pattern: string) => `This is a MOCK TEST for exam revision. It is practice only and separate from graded work: never reuse, or give away, any graded assignment listed (its task, scenario, numbers or the quantity it solves for).
${pattern ? `\nThe teacher's exam pattern (match its style and level):\n"""\n${pattern.slice(0, 1500)}\n"""\n` : ""}
- Spread the questions across the TOPICS given, and set "topic" to exactly one of them.
- Base the questions on the course notes given: the same notation, symbols and level.
- Each question is self-contained, exam-style and under 100 words. No hints inside the question.`;

export function mockConceptualSystem(jsonShape: string, pattern: string) {
  return `${voice}

${mockRules(pattern)}
- "choice": CONCEPTUAL multiple-choice questions that test understanding (why, which, what happens if), not recall of a single word. 4 options, one clearly right; "answer" is its index (0–3); "explanation" says why in 1–2 sentences.
- "open": CONCEPTUAL short-answer questions answered in 2–4 sentences. "solution" is a model answer; "finalAnswer" is the key point in one sentence.

Reply with only a JSON object of this shape:
${jsonShape}`;
}

export function mockNumericSystem(jsonShape: string, pattern: string) {
  return `${voice}

${mockRules(pattern)}
- NUMERICAL problems: give every value needed, with units, in a fresh scenario. One final value to find.
- "solution": a clear worked solution, step by step (shown only after the test).
- "finalAnswer": the final value with units, e.g. "−0.462 kJ/K".
- Check your arithmetic.

Reply with only a JSON object of this shape:
${jsonShape}`;
}

export function mockPrompt({
  course,
  topics,
  assignments,
  passages,
  rejected,
}: {
  course: string;
  topics: string[];
  assignments: Graded[];
  passages: Passage[];
  rejected?: string[];
}) {
  return `COURSE: ${course}
TOPICS: ${topics.map((t) => `"${t}"`).join(", ")}

FROM THE COURSE NOTES:
${notes(passages)}

GRADED ASSIGNMENTS TO STAY AWAY FROM:
${avoidList(assignments)}
${rejected?.length ? `\nYOUR LAST TRY WAS REJECTED — fix this:\n${rejected.map((r) => `- ${r}`).join("\n")}\nUse completely different scenarios and numbers.\n` : ""}`;
}

export function mockGradeSystem(jsonShape: string) {
  return `${voice}

You grade a student's answers to a MOCK TEST (revision practice), one result per question, using each question's model solution. Be fair and generous about notation, rounding (within about 2%) and different valid methods.

- "verdict": "correct" (right reasoning and answer), "partly" (right idea with a slip, or incomplete), "not_yet" (wrong approach, or blank).
- "score": 1 for correct, about 0.5 for partly, 0–0.2 for not_yet.
- "feedback": 1–3 short sentences to the student: what was good, and the FIRST thing to fix. Don't paste the solution (it is shown separately).
- "mistake": the error PATTERN in general terms, at most 8 words, not tied to these numbers (e.g. "kPa to Pa conversion"); "" if none.

Reply with only a JSON object of this shape:
${jsonShape}`;
}

export function mockGradePrompt(items: { ref: string; question: string; solution: string; finalAnswer: string; answer: string }[]) {
  return items
    .map(
      (i) => `${i.ref}
QUESTION:
"""
${i.question}
"""
MODEL SOLUTION:
"""
${i.solution}
"""
KEY POINT / FINAL ANSWER: ${i.finalAnswer || "(see solution)"}
STUDENT'S ANSWER:
"""
${i.answer.slice(0, 3000) || "(blank)"}
"""`,
    )
    .join("\n\n");
}
