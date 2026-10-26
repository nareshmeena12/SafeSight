import { describe, expect, it } from "vitest";
import { nameTokens, scrubText } from "./anonymise";
import {
  assembleMisconceptions,
  assembleQuiz,
  briefPrompt,
  enoughToBrief,
  quizAsText,
  selectMessages,
  shareLabel,
  type BriefMessage,
  type QuizOutput,
} from "./schema";
import { isQuizOpen, questionsForStudent, quizCodeSchema, randomQuizCode, tallyResponses } from "./quiz-schema";

const names = nameTokens(["Riya Sharma", "Arjun Mehta", "Kavita Sharma"]);

describe("scrubText", () => {
  it("removes roster names, case-insensitively and as whole words", () => {
    expect(scrubText("hi I'm riya sharma, why is W not a state function?", names)).toBe("hi I'm [name], why is W not a state function?");
    expect(scrubText("Arjun said Q = W here", names)).toBe("[name] said Q = W here");
    // Part of a longer word stays.
    expect(scrubText("Sharmaji's notes", nameTokens(["Sharm"]))).toBe("Sharmaji's notes");
  });

  it("removes contact details and roll numbers but keeps values with units", () => {
    const out = scrubText("mail me at riya.s@college.edu or 98765 43210, roll ME23B001; p = 300kPa at 1500rpm", []);
    expect(out).toBe("mail me at [email] or [number], roll [roll no.]; p = 300kPa at 1500rpm");
    expect(scrubText("see https://example.com/x?id=4", [])).toBe("see [link]");
  });

  it("cuts long text to an excerpt at a word boundary", () => {
    const out = scrubText("word ".repeat(100), [], 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
  });
});

const msg = (i: number, student: string, topic: string | null = "work"): BriefMessage => ({
  id: `m${i}`,
  studentId: student,
  text: `Why is boundary work path dependent? attempt ${i}`,
  topic,
  intent: "concept",
  at: new Date(Date.UTC(2026, 9, 20, 10, i)).toISOString(),
});

describe("selectMessages", () => {
  it("caps each student and gives stable pseudonymous refs, oldest first", () => {
    const messages = [...Array.from({ length: 20 }, (_, i) => msg(i, "a")), msg(30, "b"), msg(31, "c", null)];
    const picked = selectMessages(messages);
    expect(picked.filter((m) => m.studentId === "a")).toHaveLength(12);
    expect(picked.map((m) => m.ref)).toEqual(picked.map((_, i) => `M${i + 1}`));
    expect(new Set(picked.map((m) => m.studentRef))).toEqual(new Set(["S1", "S2", "S3"]));
    expect(picked[0].at < picked[picked.length - 1].at).toBe(true);
    // Never names or ids in the prompt.
    expect(briefPrompt({ course: "ME201", messages: picked })).not.toMatch(/\bm\d+\b|studentId/);
  });

  it("needs a few messages from at least two students", () => {
    expect(enoughToBrief(selectMessages(Array.from({ length: 10 }, (_, i) => msg(i, "a"))))).toBe(false);
    expect(enoughToBrief(selectMessages([msg(1, "a"), msg(2, "a"), msg(3, "b"), msg(4, "b"), msg(5, "a"), msg(6, "b")]))).toBe(true);
  });
});

describe("assembleMisconceptions", () => {
  const messages = selectMessages([msg(1, "a"), msg(2, "b"), msg(3, "c"), msg(4, "a"), msg(5, "d"), msg(6, "d")]);

  it("counts students from refs, ignores unknown refs and sorts by reach", () => {
    const out = assembleMisconceptions(
      {
        misconceptions: [
          { title: "Only one", summary: "One student thinks so.", refs: ["M1", "M4", "M99"], quoteRefs: ["M1"], explanation: "Explain the idea in five minutes." },
          { title: "Shared", summary: "Several students think so.", refs: ["m2", "M3", "M5"], quoteRefs: ["M3", "M3", "M2"], explanation: "Explain the idea in five minutes." },
        ],
      },
      messages,
      30,
    )!;
    expect(out.map((m) => [m.title, m.students])).toEqual([
      ["Shared", 3],
      ["Only one", 1],
    ]);
    // Quotes come from different students, and never when only one student shares it.
    expect(out[0].quotes).toHaveLength(2);
    expect(out[0].quotes.every((q) => messages.some((m) => m.text === q))).toBe(true);
    expect(out[1].quotes).toEqual([]);
  });

  it("never repeats the same words twice, even from two students", () => {
    const same = selectMessages([msg(1, "a"), msg(1, "b"), msg(2, "c")]).map((m, i) => (i < 2 ? { ...m, text: "Is work a state function or not?" } : m));
    const out = assembleMisconceptions(
      { misconceptions: [{ title: "Shared", summary: "Several students think so.", refs: ["M1", "M2", "M3"], quoteRefs: ["M1", "M2"], explanation: "Explain the idea in five minutes." }] },
      same,
      30,
    )!;
    expect(out[0].quotes).toHaveLength(2);
    expect(new Set(out[0].quotes).size).toBe(2);
  });

  it("shows no quotes in courses with fewer than five students", () => {
    const shared = { misconceptions: [{ title: "Shared", summary: "Several students think so.", refs: ["M2", "M3", "M5"], quoteRefs: ["M2", "M3"], explanation: "Explain the idea in five minutes." }] };
    expect(assembleMisconceptions(shared, messages, 4)![0].quotes).toEqual([]);
    expect(assembleMisconceptions(shared, messages, 5)![0].quotes).toHaveLength(2);
  });

  it("drops misconceptions with no real refs and rejects banned wording", () => {
    expect(
      assembleMisconceptions({ misconceptions: [{ title: "Ghost", summary: "Nobody said this.", refs: ["M42"], quoteRefs: [], explanation: "Explain the idea in five minutes." }] }, messages, 30),
    ).toBeNull();
    expect(
      assembleMisconceptions({ misconceptions: [{ title: "Students cheating", summary: "They copy answers.", refs: ["M1"], quoteRefs: [], explanation: "Explain the idea in five minutes." }] }, messages, 30),
    ).toBeNull();
  });
});

const quizOutput: QuizOutput = {
  questions: Array.from({ length: 5 }, (_, i) => ({
    question: `Question ${i + 1}?`,
    options: ["Right", "Wrong 1", "Wrong 2", "Wrong 3"],
    answer: 0,
    explanation: "Because.",
    misconception: (i % 3) + 1,
  })),
};

describe("assembleQuiz", () => {
  it("shuffles options and keeps the answer on its option", () => {
    const quiz = assembleQuiz(quizOutput, 2, () => 0.1)!;
    expect(quiz).toHaveLength(5);
    for (const q of quiz) expect(q.options[q.answer]).toBe("Right");
    // Misconception numbers become 0-based and stay within the brief.
    expect(quiz.map((q) => q.misconception)).toEqual([0, 1, 1, 0, 1]);
  });

  it("rejects duplicate options", () => {
    const dup = { questions: quizOutput.questions.map((q) => ({ ...q, options: ["A", "a", "B", "C"] })) };
    expect(assembleQuiz(dup, 3)).toBeNull();
  });

  it("prints answers only when asked", () => {
    const quiz = assembleQuiz(quizOutput, 3, () => 0.5)!;
    expect(quizAsText("Quick check", quiz, false)).not.toMatch(/Answers/);
    expect(quizAsText("Quick check", quiz, true)).toMatch(/Answers\n1\. [A-D] — Because\./);
  });
});

describe("shareLabel", () => {
  it("reads as a share of the class", () => {
    expect(shareLabel(7, 30)).toBe("7 of 30 students (23%)");
    expect(shareLabel(1, 0)).toBe("1 student");
  });
});

describe("live quiz", () => {
  it("makes 6-digit codes and reads typed ones", () => {
    for (let i = 0; i < 50; i++) expect(randomQuizCode()).toMatch(/^[1-9]\d{5}$/);
    expect(quizCodeSchema.parse(" 123 456 ")).toBe("123456");
    expect(quizCodeSchema.safeParse("12345").success).toBe(false);
  });

  it("hides answers from students while open", () => {
    const quiz = assembleQuiz(quizOutput, 3)!;
    expect(questionsForStudent(quiz, true)[0]).not.toHaveProperty("answer");
    expect(questionsForStudent(quiz, false)[0].answer).toBe(quiz[0].answer);
    expect(isQuizOpen({ closedAt: null, expiresAt: new Date(Date.now() + 1000).toISOString() })).toBe(true);
    expect(isQuizOpen({ closedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000).toISOString() })).toBe(false);
    expect(isQuizOpen({ closedAt: null, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });

  it("tallies counts per option without who chose what", () => {
    const { results, participants } = tallyResponses(
      [{ options: ["a", "b", "c", "d"] }, { options: ["a", "b", "c", "d"] }],
      [
        { question_index: 0, choice: 1, student_id: "x" },
        { question_index: 0, choice: 1, student_id: "y" },
        { question_index: 1, choice: 3, student_id: "x" },
        { question_index: 7, choice: 0, student_id: "z" },
      ],
    );
    expect(results).toEqual([
      { counts: [0, 2, 0, 0], answered: 2 },
      { counts: [0, 0, 0, 1], answered: 1 },
    ]);
    expect(participants).toBe(3);
  });
});
