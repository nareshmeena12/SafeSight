import "server-only";
import { generateJson } from "@/lib/learning/ai";
import { checkFeedback, checkPracticeItem } from "@/lib/learning/checks";
import { recordMastery, recordMistake } from "@/lib/learning/data";
import { shuffleOptions } from "@/lib/learning/shuffle";
import { relatedTopics, topicLabel } from "@/lib/learning/topics";
import { searchCourseMaterial } from "@/lib/materials/search";
import type { Course } from "@/lib/sage/data";
import { activeAssignments } from "@/lib/sage/data";
import { lexicalSimilarity, MATCH_THRESHOLD, type SageAssignment } from "@/lib/sage/match";
import { createAdminClient } from "@/lib/supabase/admin";
import { bandScore, mockScore, numericMatch, topicScores, type Verdict } from "./grade";
import { MOCK_SHAPES, mockTopics } from "./plan";
import { mockConceptualSystem, mockGradePrompt, mockGradeSystem, mockNumericSystem, mockPrompt } from "./prompts";
import {
  mockConceptualJsonShape,
  mockConceptualOutputSchema,
  mockGradeJsonShape,
  mockGradeOutputSchema,
  mockNumericJsonShape,
  mockNumericOutputSchema,
  planTopicsSchema,
} from "./schemas";
import { readExamInfo } from "./topics";

/**
 * Timed mock tests (S20). Practice only: questions come from the course notes,
 * every one is checked in code against the student's active graded
 * assignments (similarity, answer-key values), answers stay in a server-only
 * table until the test is graded, and nothing here reaches the teacher.
 */

type Fail = { ok: false; status: number; message: string };

const SEARCH_MS = 3_000;
const BUDGET_MS = 52_000;
const ROUND_MS = 22_000;
const MARKS = { choice: 1, open: 3, numeric: 4 } as const;

function courseLabel(c: Course) {
  return c.code ? `${c.code} ${c.name}` : c.name;
}

/** A topic that names an active Exam-mode assignment waits until that exam is over. */
function examOn(topic: string, assignments: SageAssignment[]) {
  return assignments.some((a) => a.mode === "exam" && lexicalSimilarity(topic, a) >= MATCH_THRESHOLD);
}

/** The model's topic label snapped to one of the test's topics. */
function snapTopic(label: string, topics: string[]) {
  const t = label.trim();
  return topics.find((x) => x.toLowerCase() === t.toLowerCase()) ?? topics.find((x) => relatedTopics(x, t)) ?? topics[0];
}

type Draft =
  | { kind: "conceptual"; format: "choice"; topic: string; question: string; options: string[]; answer: number; solution: string }
  | { kind: "conceptual" | "numeric"; format: "open"; topic: string; question: string; solution: string; finalAnswer: string };

export async function createMockTest({
  studentId,
  course,
  plan,
  size,
}: {
  studentId: string;
  course: Course;
  plan: { id: string; topics: unknown };
  size: "short" | "full";
}): Promise<{ ok: true; testId: string } | Fail> {
  const shape = MOCK_SHAPES[size];
  const [assignments, info] = await Promise.all([activeAssignments(course.id), readExamInfo(course.id)]);
  const planned = planTopicsSchema.safeParse(plan.topics).data ?? [];
  const topics = mockTopics(
    planned.filter((t) => !examOn(t.title, assignments)),
    size === "full" ? 5 : 3,
  );
  if (!topics.length) {
    return { ok: false, status: 409, message: "There are no topics to test yet — plan again once you've chatted with Sage or your teacher has added notes." };
  }

  const started = Date.now();
  const passages = (
    await Promise.all(
      topics.map((t) =>
        Promise.race([
          searchCourseMaterial(course.id, t, { limit: 2, usage: { feature: "exam_notes_search", userId: studentId } }).catch(() => []),
          new Promise<never[]>((resolve) => setTimeout(() => resolve([]), SEARCH_MS)),
        ]),
      ),
    )
  )
    .flat()
    .filter((p, i, all) => all.findIndex((q) => q.materialId === p.materialId && q.page === p.page) === i)
    .slice(0, 8);

  const want = { choice: shape.choice, open: shape.open, numeric: shape.numeric };
  const accepted: Draft[] = [];
  const rejected: string[] = [];
  const count = (k: "choice" | "open" | "numeric") =>
    accepted.filter((d) => (k === "choice" ? d.format === "choice" : k === "open" ? d.format === "open" && d.kind === "conceptual" : d.kind === "numeric")).length;
  const keep = (d: Draft, check: { question: string; solution: string }) => {
    const verdict = checkPracticeItem(check, assignments);
    if (!verdict.ok) return void rejected.push(verdict.reason);
    if (!accepted.some((a) => a.question === d.question)) accepted.push(d);
  };

  for (let round = 0; round < 2; round++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (round && left < ROUND_MS) break;
    const needChoice = want.choice - count("choice");
    const needOpen = want.open - count("open");
    const needNumeric = want.numeric - count("numeric");
    if (needChoice <= 0 && needOpen <= 0 && needNumeric <= 0) break;
    const prompt = mockPrompt({ course: courseLabel(course), topics, assignments, passages, rejected: round ? rejected : undefined });
    // Conceptual and numerical questions are written in parallel.
    const [conceptual, numeric] = await Promise.all([
      needChoice > 0 || needOpen > 0
        ? generateJson({
            feature: "mock_generate",
            userId: studentId,
            system: mockConceptualSystem(mockConceptualJsonShape(Math.max(0, needChoice), Math.max(0, needOpen)), info.pattern),
            prompt,
            schema: mockConceptualOutputSchema,
            name: "mock_conceptual",
            maxOutputTokens: 6000,
            timeoutMs: Math.min(40_000, left),
            temperature: 0.5,
            attempts: 1,
          })
        : null,
      needNumeric > 0
        ? generateJson({
            feature: "mock_generate",
            userId: studentId,
            system: mockNumericSystem(mockNumericJsonShape(needNumeric), info.pattern),
            prompt,
            schema: mockNumericOutputSchema,
            name: "mock_numeric",
            maxOutputTokens: 6000,
            timeoutMs: Math.min(40_000, left),
            temperature: 0.5,
            attempts: 1,
          })
        : null,
    ]);
    for (const c of conceptual?.choice ?? []) {
      if (count("choice") >= want.choice) break;
      // Models tend to put the right option first.
      const s = shuffleOptions(c);
      keep(
        { kind: "conceptual", format: "choice", topic: snapTopic(c.topic, topics), question: s.question, options: s.options, answer: s.answer, solution: s.explanation },
        { question: `${s.question}\n${s.options.join("\n")}`, solution: s.explanation },
      );
    }
    for (const o of conceptual?.open ?? []) {
      if (count("open") >= want.open) break;
      keep({ kind: "conceptual", format: "open", topic: snapTopic(o.topic, topics), question: o.question, solution: o.solution, finalAnswer: o.finalAnswer }, o);
    }
    for (const p of numeric?.problems ?? []) {
      if (count("numeric") >= want.numeric) break;
      keep({ kind: "numeric", format: "open", topic: snapTopic(p.topic, topics), question: p.question, solution: p.solution, finalAnswer: p.finalAnswer }, p);
    }
    if (!conceptual && !numeric) break;
  }

  const total = want.choice + want.open + want.numeric;
  if (accepted.length < Math.ceil(total * 0.6)) {
    return {
      ok: false,
      status: 503,
      message: rejected.length
        ? "Sage couldn't write a mock test that's different enough from your assignments just now. Please try again in a moment."
        : "Sage couldn't write your mock test just now. Please try again in a moment.",
    };
  }

  // Multiple choice first, then short answers, then numericals — like most papers.
  const ordered = [
    ...accepted.filter((d) => d.format === "choice"),
    ...accepted.filter((d) => d.format === "open" && d.kind === "conceptual"),
    ...accepted.filter((d) => d.kind === "numeric"),
  ];
  // The clock starts when the test is ready, not while it was being written.
  const start = new Date();
  const admin = createAdminClient();
  const { data: test, error } = await admin
    .from("mock_tests")
    .insert({
      student_id: studentId,
      course_id: course.id,
      plan_id: plan.id,
      title: `${size === "full" ? "Mock test" : "Short mock test"} · ${course.code || course.name}`,
      topics,
      minutes: shape.minutes,
      started_at: start.toISOString(),
      ends_at: new Date(start.getTime() + shape.minutes * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !test) throw new Error(`mock test: ${error?.message}`);
  const { data: items, error: itemsError } = await admin
    .from("mock_test_items")
    .insert(
      ordered.map((d, i) => ({
        test_id: test.id,
        position: i + 1,
        kind: d.kind,
        format: d.format,
        topic: topicLabel(d.topic).slice(0, 120),
        question: d.question,
        options: d.format === "choice" ? d.options : null,
        marks: d.format === "choice" ? MARKS.choice : d.kind === "numeric" ? MARKS.numeric : MARKS.open,
      })),
    )
    .select("id, position");
  if (itemsError || !items) throw new Error(`mock items: ${itemsError?.message}`);
  const { error: keyError } = await admin.from("mock_test_item_keys").insert(
    items.map((it) => {
      const d = ordered[it.position - 1];
      return d.format === "choice"
        ? { item_id: it.id, solution: d.solution, final_answer: d.options[d.answer].slice(0, 500), correct_choice: d.answer }
        : { item_id: it.id, solution: d.solution, final_answer: d.finalAnswer.slice(0, 500) };
    }),
  );
  if (keyError) throw new Error(`mock keys: ${keyError.message}`);
  return { ok: true, testId: test.id };
}

// ------------------------------------------------------------- grading

type Item = {
  id: string;
  kind: string;
  format: string;
  topic: string;
  question: string;
  marks: number;
  answer: string | null;
  choice: number | null;
};

export type GradeResult = { ok: true; marks: number; maxMarks: number; score: number | null; unchecked: number } | Fail;

/**
 * Grade a submitted test: multiple choice and matching numericals in code,
 * the rest in one model call. If the model is unavailable, those questions
 * are "unchecked" and left out of the score (the solutions still show).
 * Then mastery per topic and the mistake log.
 */
export async function gradeMockTest({
  studentId,
  test,
  items,
  useModel = true,
}: {
  studentId: string;
  test: { id: string; course_id: string };
  items: Item[];
  /** False when the student is over the hourly limit: written answers are left unchecked. */
  useModel?: boolean;
}): Promise<GradeResult> {
  const admin = createAdminClient();
  const { data: keys, error } = await admin
    .from("mock_test_item_keys")
    .select("item_id, solution, final_answer, correct_choice")
    .in(
      "item_id",
      items.map((i) => i.id),
    );
  if (error) throw new Error(`mock keys: ${error.message}`);
  const key = new Map((keys ?? []).map((k) => [k.item_id, k]));

  const graded = new Map<string, { verdict: Verdict; score: number | null; feedback: string; mistake: string }>();
  const toModel: Item[] = [];
  for (const i of items) {
    const k = key.get(i.id);
    if (!k) continue;
    const answer = i.answer?.trim() ?? "";
    if (i.format === "choice") {
      const right = i.choice !== null && i.choice === k.correct_choice;
      graded.set(i.id, {
        verdict: right ? "correct" : "not_yet",
        score: right ? 1 : 0,
        feedback: i.choice === null ? "No option picked." : right ? "That's right." : "Not this one — see why below.",
        mistake: "",
      });
    } else if (!answer) {
      graded.set(i.id, { verdict: "not_yet", score: 0, feedback: "Left blank. Read the worked solution below, then try a similar problem in Practice.", mistake: "" });
    } else if (i.kind === "numeric" && numericMatch(answer, k.final_answer)) {
      graded.set(i.id, { verdict: "correct", score: 1, feedback: "Your final value matches. Check your steps against the worked solution.", mistake: "" });
    } else {
      toModel.push(i);
    }
  }

  if (toModel.length) {
    const refs = new Map(toModel.map((i, n) => [`Q${n + 1}`, i]));
    const out = !useModel
      ? null
      : await generateJson({
          feature: "mock_grade",
          userId: studentId,
          system: mockGradeSystem(mockGradeJsonShape),
          prompt: mockGradePrompt(
            [...refs].map(([ref, i]) => ({
              ref,
              question: i.question,
              solution: key.get(i.id)!.solution,
              finalAnswer: key.get(i.id)!.final_answer,
              answer: i.answer ?? "",
            })),
          ),
          schema: mockGradeOutputSchema,
          name: "mock_grade",
          maxOutputTokens: 4000,
          timeoutMs: 40_000,
          temperature: 0.1,
        });
    const assignments = out ? await activeAssignments(test.course_id) : [];
    for (const [ref, i] of refs) {
      const r = out?.results.find((x) => x.ref.trim().toUpperCase() === ref);
      if (!r) {
        graded.set(i.id, { verdict: "unchecked", score: null, feedback: "Sage couldn't check this one just now. Compare your answer with the worked solution below.", mistake: "" });
        continue;
      }
      const safe = checkFeedback(r.feedback, `${i.question}\n${key.get(i.id)!.solution}\n${i.answer ?? ""}`, assignments.map((a) => a.answerKey));
      graded.set(i.id, {
        verdict: r.verdict,
        score: bandScore(r.verdict, r.score),
        feedback: safe.ok ? r.feedback : "Compare your steps with the worked solution below, line by line, to see where they differ.",
        mistake: r.verdict === "correct" ? "" : r.mistake.trim(),
      });
    }
  }

  for (const i of items) {
    const g = graded.get(i.id);
    const k = key.get(i.id);
    if (!g || !k) continue;
    const { error: updateError } = await admin
      .from("mock_test_items")
      .update({
        verdict: g.verdict,
        score: g.score,
        feedback: g.feedback.slice(0, 2000),
        // Multiple choice: name the right option above the explanation.
        solution: (i.format === "choice" ? `**Right answer:** ${k.final_answer}\n\n${k.solution}` : k.solution).slice(0, 4000),
      })
      .eq("id", i.id);
    if (updateError) throw new Error(`mock grade: ${updateError.message}`);
  }

  const rows = items.map((i) => ({ ...i, verdict: graded.get(i.id)?.verdict ?? null, score: graded.get(i.id)?.score ?? null }));
  const total = mockScore(rows);
  const { error: testError } = await admin
    .from("mock_tests")
    .update({ graded_at: new Date().toISOString(), marks: total.marks, max_marks: total.max, score: total.score })
    .eq("id", test.id);
  if (testError) throw new Error(`mock total: ${testError.message}`);

  for (const t of topicScores(rows)) {
    await recordMastery({ studentId, courseId: test.course_id, topic: t.topic, score: t.score, source: "mock" });
  }
  for (const i of items) {
    const g = graded.get(i.id);
    if (g?.mistake) await recordMistake({ studentId, courseId: test.course_id, label: g.mistake, topic: i.topic });
  }
  return { ok: true, marks: total.marks, maxMarks: total.max, score: total.score, unchecked: total.unchecked };
}
