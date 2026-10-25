import "server-only";
import { searchCourseMaterial } from "@/lib/materials/search";
import { activeAssignments } from "@/lib/sage/data";
import { lexicalSimilarity, MATCH_THRESHOLD, type SageAssignment } from "@/lib/sage/match";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "./ai";
import { checkFeedback, checkPracticeItem } from "./checks";
import { readMistakes, recordMastery, recordMistake } from "./data";
import { setScore, type Mastery } from "./mastery";
import { shuffleOptions } from "./shuffle";
import {
  gradePrompt,
  gradeSystem,
  practicePrompt,
  practiceSystem,
  refresherPrompt,
  refresherSystem,
} from "./prompts";
import {
  difficulties,
  gradeJsonShape,
  gradeOutputSchema,
  practiceJsonShape,
  practiceOutputSchema,
  refresherJsonShape,
  refresherOutputSchema,
} from "./schemas";
import { relatedTopics, topicKey, topicLabel } from "./topics";

/**
 * Practice mode, "Review before exam" and prerequisite refreshers. Problems
 * are new, never one of the student's graded assignments: the prompt lists
 * the active assignments to stay away from, and every problem is checked in
 * code (similarity, answer-key values) before it is saved. Solutions stay in
 * a server-only table until the student has answered.
 */

export type Course = { id: string; name: string; code: string };
type Fail = { ok: false; status: number; message: string };

const SEARCH_MS = 2_500;
/** The routes allow 60 s; generation stops trying at this. */
const BUDGET_MS = 50_000;
/** A second round only starts if this much time is left. */
const ROUND_MS = 22_000;

function courseLabel(c: Course) {
  return c.code ? `${c.code} ${c.name}` : c.name;
}

async function notesFor(courseId: string, topic: string, studentId: string) {
  try {
    const passages = await Promise.race([
      searchCourseMaterial(courseId, topic, { limit: 2, usage: { feature: "practice_notes_search", userId: studentId } }),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), SEARCH_MS)),
    ]);
    return passages.map((p) => ({ title: p.title, page: p.page, content: p.content }));
  } catch {
    return [];
  }
}

/** An Exam-mode assignment this topic names: practice on it waits until the exam is over. */
function examOn(topic: string, assignments: SageAssignment[]) {
  return assignments.find((a) => a.mode === "exam" && lexicalSimilarity(topic, a) >= MATCH_THRESHOLD) ?? null;
}

export async function createPracticeSet({
  studentId,
  course,
  topic: rawTopic,
  kind,
  source,
}: {
  studentId: string;
  course: Course;
  topic: string;
  kind: "practice" | "review" | "refresher";
  source: "explore" | "learning" | "sage";
}): Promise<{ ok: true; setId: string } | Fail> {
  const topic = topicLabel(rawTopic);
  const assignments = await activeAssignments(course.id);
  const exam = examOn(topic, assignments);
  if (exam) {
    return { ok: false, status: 409, message: `${exam.title} is in Exam mode right now, so practice on it is paused until it's over.` };
  }
  return kind === "refresher"
    ? createRefresher({ studentId, course, topic, assignments, source })
    : createProblems({ studentId, course, topic, kind, assignments, source });
}

async function createProblems({
  studentId,
  course,
  topic,
  kind,
  assignments,
  source,
}: {
  studentId: string;
  course: Course;
  topic: string;
  kind: "practice" | "review";
  assignments: SageAssignment[];
  source: "explore" | "learning" | "sage";
}): Promise<{ ok: true; setId: string } | Fail> {
  // Review sets aim at the student's repeated mistakes and weak topics.
  let focus: string[] | undefined;
  let targets: string[] = [];
  if (kind === "review") {
    const [mistakes, weak] = await Promise.all([readMistakes(studentId, course.id, 30), weakTopics(studentId, course.id)]);
    const open = mistakes.filter((m) => !m.reviewed_at).sort((a, b) => b.count - a.count).slice(0, 3);
    targets = open.map((m) => m.id);
    focus = [
      ...open.map((m) => `mistake: ${m.label}${m.topic ? ` (${m.topic})` : ""}`),
      ...weak
        .filter((w) => !open.some((m) => relatedTopics(m.topic, w)))
        .slice(0, Math.max(1, 3 - open.length))
        .map((w) => `weak topic: ${w}`),
    ];
    if (!focus.length) {
      return { ok: false, status: 404, message: "Nothing to review yet — your mistake log and weak topics are empty. Try Practice on a topic instead." };
    }
  }

  const started = Date.now();
  const passages = await notesFor(course.id, kind === "review" ? (focus ?? []).join(" ") : topic, studentId);
  const accepted: { difficulty: (typeof difficulties)[number]; question: string; solution: string; finalAnswer: string; topic?: string }[] = [];
  const rejected: string[] = [];
  for (let round = 0; round < 2 && accepted.length < 3; round++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (round && left < ROUND_MS) break;
    const out = await generateJson({
      feature: "practice_generate",
      userId: studentId,
      system: practiceSystem(practiceJsonShape),
      prompt: practicePrompt({ course: courseLabel(course), topic, assignments, passages, focus, rejected: round ? rejected : undefined }),
      schema: practiceOutputSchema,
      name: "practice",
      // Room for a reasoning model's thinking as well as the three problems.
      maxOutputTokens: 6000,
      timeoutMs: Math.min(35_000, left),
      temperature: 0.6,
      attempts: 1,
    });
    if (!out) break;
    for (const p of out.problems) {
      if (accepted.length >= 3) break;
      const check = checkPracticeItem(p, assignments);
      if (!check.ok) rejected.push(check.reason);
      else if (!accepted.some((a) => a.question === p.question)) accepted.push(p);
    }
  }
  if (accepted.length < 2) {
    return {
      ok: false,
      status: 503,
      message: rejected.length
        ? "Sage couldn't make problems on this topic that are different enough from your assignments. Try a broader topic."
        : "Sage couldn't make practice problems just now. Please try again in a moment.",
    };
  }

  const admin = createAdminClient();
  const { data: set, error } = await admin
    .from("practice_sets")
    .insert({ student_id: studentId, course_id: course.id, kind, topic, topic_key: topicKey(topic), source, targets })
    .select("id")
    .single();
  if (error || !set) throw new Error(`practice set: ${error?.message}`);
  const { data: items, error: itemsError } = await admin
    .from("practice_items")
    .insert(
      accepted.map((p, i) => ({
        set_id: set.id,
        position: i + 1,
        // Easy → hard by position, whatever the model labelled them.
        difficulty: difficulties[Math.min(i, 2)],
        format: "open",
        question: p.question,
        topic: kind === "review" && p.topic?.trim() ? topicLabel(p.topic.replace(/^(mistake|weak topic):\s*/i, "")) : null,
      })),
    )
    .select("id, position");
  if (itemsError || !items) throw new Error(`practice items: ${itemsError?.message}`);
  const { error: keyError } = await admin.from("practice_item_keys").insert(
    items.map((it) => {
      const p = accepted[it.position - 1];
      return { item_id: it.id, solution: p.solution, final_answer: p.finalAnswer.slice(0, 500) };
    }),
  );
  if (keyError) throw new Error(`practice keys: ${keyError.message}`);
  return { ok: true, setId: set.id };
}

async function weakTopics(studentId: string, courseId: string) {
  const { data } = await createAdminClient()
    .from("topic_mastery")
    .select("topic, mastery")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .lt("mastery", 0.6)
    .order("mastery")
    .limit(5);
  return (data ?? []).map((t) => t.topic);
}

async function createRefresher({
  studentId,
  course,
  topic,
  assignments,
  source,
}: {
  studentId: string;
  course: Course;
  topic: string;
  assignments: SageAssignment[];
  source: "explore" | "learning" | "sage";
}): Promise<{ ok: true; setId: string } | Fail> {
  const mistakes = (await readMistakes(studentId, course.id, 20)).filter((m) => relatedTopics(m.topic || m.label, topic));
  const recent = mistakes.slice(0, 4).map((m) => m.label);
  const started = Date.now();
  for (let round = 0; round < 2; round++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (round && left < ROUND_MS) break;
    const out = await generateJson({
      feature: "refresher_generate",
      userId: studentId,
      system: refresherSystem(refresherJsonShape),
      prompt: refresherPrompt({ course: courseLabel(course), topic, assignments, recent }),
      schema: refresherOutputSchema,
      name: "refresher",
      maxOutputTokens: 5000,
      timeoutMs: Math.min(35_000, left),
      attempts: 1,
    });
    if (!out) break;
    const checks = out.checks
      .slice(0, 2)
      .filter((c) => c.answer < c.options.length)
      // Models tend to put the right option first.
      .map((c) => shuffleOptions(c))
      .filter((c) => checkPracticeItem({ question: `${c.question}\n${c.options.join("\n")}`, solution: c.explanation }, assignments).ok);
    const lessonOk = checkPracticeItem({ question: out.lesson, solution: "" }, assignments).ok;
    if (checks.length < 2 || !lessonOk) continue;

    const admin = createAdminClient();
    const { data: set, error } = await admin
      .from("practice_sets")
      .insert({
        student_id: studentId,
        course_id: course.id,
        kind: "refresher",
        topic,
        topic_key: topicKey(topic),
        skill: topicLabel(out.skill),
        lesson: out.lesson.slice(0, 4000),
        source,
      })
      .select("id")
      .single();
    if (error || !set) throw new Error(`refresher set: ${error?.message}`);
    const { data: items, error: itemsError } = await admin
      .from("practice_items")
      .insert(
        checks.map((c, i) => ({
          set_id: set.id,
          position: i + 1,
          difficulty: "check",
          format: "choice",
          question: c.question,
          options: c.options,
        })),
      )
      .select("id, position");
    if (itemsError || !items) throw new Error(`refresher items: ${itemsError?.message}`);
    const { error: keyError } = await admin.from("practice_item_keys").insert(
      items.map((it) => {
        const c = checks[it.position - 1];
        return { item_id: it.id, solution: c.explanation, final_answer: c.options[c.answer], correct_choice: c.answer };
      }),
    );
    if (keyError) throw new Error(`refresher keys: ${keyError.message}`);
    return { ok: true, setId: set.id };
  }
  return { ok: false, status: 503, message: "Sage couldn't put a refresher together just now. Please try again in a moment." };
}

// ------------------------------------------------------------- answering

export type AnsweredItem = {
  id: string;
  score: number;
  verdict: "correct" | "partly" | "not_yet";
  feedback: string;
  solution: string;
};

export type AnswerResult =
  | { ok: true; item: AnsweredItem; set: { completed: boolean; score: number | null; mastery: Mastery | null } }
  | Fail;

/** Numbers within 2% count as the same answer. */
function sameNumber(answer: string, finalAnswer: string) {
  const want = [...finalAnswer.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!want.length) return false;
  const got = [...answer.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const target = want[0];
  return got.some((g) => (target === 0 ? Math.abs(g) < 1e-9 : Math.abs(g - target) / Math.abs(target) <= 0.02));
}

/**
 * Grade one answer. The item was read under the student's own row-level
 * security by the caller, which proves it is theirs.
 */
export async function answerItem({
  studentId,
  item,
  set,
  answer,
  choice,
  assignments,
}: {
  studentId: string;
  item: { id: string; format: string; question: string; options: unknown; topic: string | null };
  set: { id: string; kind: "practice" | "review" | "refresher"; course_id: string; topic: string; skill: string | null; targets: string[] };
  answer?: string;
  choice?: number;
  /** Active assignments' answer keys, so feedback never leaks one. */
  assignments: SageAssignment[];
}): Promise<AnswerResult> {
  const admin = createAdminClient();
  const { data: key } = await admin.from("practice_item_keys").select("solution, final_answer, correct_choice").eq("item_id", item.id).maybeSingle();
  if (!key) return { ok: false, status: 404, message: "We couldn't find this question. Please reload the page." };

  let graded: { score: number; verdict: AnsweredItem["verdict"]; feedback: string; mistake: string };
  if (item.format === "choice") {
    if (choice === undefined) return { ok: false, status: 400, message: "Pick an option first." };
    const right = choice === key.correct_choice;
    graded = {
      score: right ? 1 : 0,
      verdict: right ? "correct" : "not_yet",
      feedback: right ? `That's right. ${key.solution}` : `Not this one. ${key.solution}`,
      mistake: "",
    };
  } else {
    if (!answer?.trim()) return { ok: false, status: 400, message: "Write an answer first." };
    const out = await generateJson({
      feature: "practice_grade",
      userId: studentId,
      system: gradeSystem(gradeJsonShape),
      prompt: gradePrompt({ question: item.question, solution: key.solution, finalAnswer: key.final_answer, answer }),
      schema: gradeOutputSchema,
      name: "grade",
      maxOutputTokens: 3000,
      temperature: 0.1,
    });
    if (out) {
      const score = out.verdict === "correct" ? Math.max(0.8, out.score) : out.verdict === "partly" ? Math.min(0.79, Math.max(0.3, out.score)) : Math.min(0.29, out.score);
      const safe = checkFeedback(out.feedback, `${item.question}\n${key.solution}\n${answer}`, assignments.map((a) => a.answerKey));
      graded = {
        score: Math.round(score * 100) / 100,
        verdict: out.verdict,
        feedback: safe.ok ? out.feedback : "Compare your steps with the worked solution below, line by line, to see where they differ.",
        mistake: out.verdict === "correct" ? "" : out.mistake.trim(),
      };
    } else if (sameNumber(answer, key.final_answer)) {
      // The grader is unavailable, but the final value matches.
      graded = { score: 1, verdict: "correct", feedback: "Your final value matches. Check your steps against the worked solution below.", mistake: "" };
    } else {
      return { ok: false, status: 503, message: "Sage couldn't check this answer just now. Your answer is still here — try again in a moment." };
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("practice_items")
    .update({
      answer: item.format === "open" ? answer!.trim() : null,
      choice: item.format === "choice" ? choice! : null,
      score: graded.score,
      verdict: graded.verdict,
      feedback: graded.feedback.slice(0, 2000),
      solution: key.solution,
      answered_at: now,
    })
    .eq("id", item.id)
    .is("answered_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`answer: ${error.message}`);
  if (!updated) return { ok: false, status: 409, message: "You've already answered this one. Reload to see your feedback." };

  const topic = set.kind === "refresher" ? set.skill ?? set.topic : item.topic ?? set.topic;
  if (graded.mistake) {
    await recordMistake({ studentId, courseId: set.course_id, label: graded.mistake, topic });
  }

  // The set is done when every item is answered.
  const { data: all } = await admin.from("practice_items").select("score, topic, answered_at").eq("set_id", set.id);
  const completed = (all ?? []).every((i) => i.answered_at);
  let score: number | null = null;
  let mastery: Mastery | null = null;
  if (completed) {
    score = setScore((all ?? []).map((i) => i.score));
    await admin.from("practice_sets").update({ completed_at: now, score }).eq("id", set.id).is("completed_at", null);
    if (set.kind === "review") {
      // Each topic in a mixed review set gets its own result.
      const byTopic = new Map<string, number[]>();
      for (const i of all ?? []) {
        const t = i.topic ?? set.topic;
        byTopic.set(t, [...(byTopic.get(t) ?? []), i.score ?? 0]);
      }
      for (const [t, scores] of byTopic) {
        if (t === set.topic) continue;
        await recordMastery({ studentId, courseId: set.course_id, topic: t, score: setScore(scores) ?? 0, source: "review" });
      }
      if ((score ?? 0) >= 0.67 && set.targets.length) {
        await admin.from("mistake_patterns").update({ reviewed_at: now }).in("id", set.targets).eq("student_id", studentId);
      }
    } else {
      mastery = await recordMastery({
        studentId,
        courseId: set.course_id,
        topic,
        score: score ?? 0,
        source: set.kind,
      });
    }
  }
  return {
    ok: true,
    item: { id: item.id, score: graded.score, verdict: graded.verdict, feedback: graded.feedback, solution: key.solution },
    set: { completed, score, mastery },
  };
}
