import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiStatus } from "@/lib/ai/provider";
import { generateJson } from "@/lib/learning/ai";
import { topicLabel } from "@/lib/learning/topics";
import { allowLearningCall } from "@/lib/learning/usage";
import { searchCourseMaterial } from "@/lib/materials/search";
import type { Course } from "@/lib/sage/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { usesBannedWords } from "@/lib/trace/summary";
import type { BaseTopic, NoteRef } from "./plan";
import { noteTopicsPrompt, noteTopicsSystem } from "./prompts";
import { noteTopicsJsonShape, noteTopicsOutputSchema, noteTopicsSchema, syllabusTopicsSchema } from "./schemas";

/**
 * Where a plan's topics come from. Call only after the student's enrollment
 * was proven under row-level security (these reads use the service role).
 *
 * 1. The official syllabus, when the teacher published one for exam prep,
 *    or else the course's topic map from S22's course setup.
 * 2. Otherwise topics read from the course notes: one model call per set of
 *    notes, cached in course_note_topics for every student of the course.
 * 3. Otherwise nothing here, and the plan uses the student's own topics.
 *
 * Each topic gets a link to the page of the notes that teaches it.
 */

const SEARCH_MS = 4_000;
const MAX_SEARCHES = 14;
const EXCERPTS = 40;

export type ExamInfo = { topics: { title: string; unit: string | null }[]; pattern: string; examDate: string | null };

export async function readExamInfo(courseId: string): Promise<ExamInfo> {
  const { data } = await createAdminClient().from("course_exam_info").select("topics, pattern, exam_date").eq("course_id", courseId).maybeSingle();
  return {
    topics: syllabusTopicsSchema.safeParse(data?.topics ?? []).data ?? [],
    pattern: data?.pattern ?? "",
    examDate: data?.exam_date ?? null,
  };
}

function courseLabel(c: Course) {
  return c.code ? `${c.code} ${c.name}` : c.name;
}

/** Topics read out of the course notes (cached per set of ready notes), or [] when there are none or no model. */
async function noteTopics(course: Course, studentId: string): Promise<{ title: string; note: NoteRef }[]> {
  const admin = createAdminClient();
  const { data: materials } = await admin
    .from("materials")
    .select("id, title, page_count")
    .eq("course_id", course.id)
    .eq("status", "ready")
    .order("created_at");
  if (!materials?.length) return [];
  const sourceKey = materials.map((m) => `${m.id}:${m.page_count ?? 0}`).join(",").slice(0, 4000);
  const title = new Map(materials.map((m) => [m.id, m.title]));

  const { data: cached } = await admin.from("course_note_topics").select("topics, source_key").eq("course_id", course.id).maybeSingle();
  if (cached?.source_key === sourceKey) {
    return (noteTopicsSchema.safeParse(cached.topics).data ?? []).map((t) => ({
      title: t.title,
      note: { materialId: t.materialId, title: title.get(t.materialId) ?? "Course notes", page: t.page },
    }));
  }
  if (!aiStatus().chat || !(await allowLearningCall(studentId, "exam_topics"))) return [];

  // A spread of short excerpts across every set of notes, in page order.
  const { data: chunks } = await admin
    .from("material_chunks")
    .select("material_id, page, content")
    .in(
      "material_id",
      materials.map((m) => m.id),
    )
    .order("page", { ascending: true, nullsFirst: false })
    .limit(600);
  const all = chunks ?? [];
  if (!all.length) return [];
  const step = Math.max(1, all.length / EXCERPTS);
  const picked = Array.from({ length: Math.min(EXCERPTS, all.length) }, (_, i) => all[Math.floor(i * step)]);
  const excerpts = picked.map((c, i) => ({
    ref: `P${i + 1}`,
    title: title.get(c.material_id) ?? "Notes",
    page: c.page,
    text: c.content.replace(/\s+/g, " ").slice(0, 280),
  }));

  const out = await generateJson({
    feature: "exam_topics",
    userId: studentId,
    system: noteTopicsSystem(noteTopicsJsonShape),
    prompt: noteTopicsPrompt({ course: courseLabel(course), excerpts }),
    schema: noteTopicsOutputSchema,
    name: "note_topics",
    maxOutputTokens: 2000,
    timeoutMs: 25_000,
    temperature: 0.2,
  });
  if (!out) return [];
  const seen = new Set<string>();
  const topics = out.topics
    .map((t) => {
      const e = excerpts.find((x) => x.ref === t.ref.trim().toUpperCase()) ?? excerpts[0];
      return { title: topicLabel(t.title), materialId: picked[excerpts.indexOf(e)].material_id, page: e.page };
    })
    .filter((t) => t.title.length >= 2 && !usesBannedWords(t.title) && !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()))
    .slice(0, 14);
  if (topics.length) {
    const { error } = await admin
      .from("course_note_topics")
      .upsert({ course_id: course.id, topics, source_key: sourceKey, created_at: new Date().toISOString() }, { onConflict: "course_id" });
    if (error) console.error("note topics:", error.message);
  }
  return topics.map((t) => ({ title: t.title, note: { materialId: t.materialId, title: title.get(t.materialId) ?? "Course notes", page: t.page } }));
}

/** The best page of the notes for each topic (keyword + vector search, a few seconds at most). */
export async function notesForTopics(courseId: string, titles: string[], studentId: string): Promise<Map<string, NoteRef[]>> {
  const out = new Map<string, NoteRef[]>();
  await Promise.all(
    titles.slice(0, MAX_SEARCHES).map(async (t) => {
      try {
        const passages = await Promise.race([
          searchCourseMaterial(courseId, t, { limit: 1, usage: { feature: "exam_notes_search", userId: studentId } }),
          new Promise<never[]>((resolve) => setTimeout(() => resolve([]), SEARCH_MS)),
        ]);
        out.set(
          t,
          passages.map((p) => ({ materialId: p.materialId, title: p.title, page: p.page })),
        );
      } catch {
        out.set(t, []);
      }
    }),
  );
  return out;
}

/**
 * S22's course topic map (course_topics, built from the syllabus by the
 * teacher), when that table exists. Built alongside S22, so it is read
 * untyped and a missing table just means "no topic map".
 */
async function topicMap(courseId: string): Promise<string[]> {
  const untyped = createAdminClient() as unknown as SupabaseClient;
  const { data, error } = await untyped.from("course_topics").select("title, position").eq("course_id", courseId).order("position").limit(60);
  if (error || !Array.isArray(data)) return [];
  return data.map((r: { title?: unknown }) => (typeof r.title === "string" ? r.title.trim() : "")).filter(Boolean);
}

/** The plan's base topics and what they came from. */
export async function courseTopics(course: Course, studentId: string, info: ExamInfo) {
  if (info.topics.length) {
    return {
      base: info.topics.map((t): BaseTopic => ({ title: t.title, unit: t.unit, source: "syllabus" })),
      fromSyllabus: true,
      fromNotes: false,
    };
  }
  const mapped = await topicMap(course.id).catch(() => []);
  if (mapped.length) {
    return { base: mapped.map((title): BaseTopic => ({ title, source: "syllabus" })), fromSyllabus: true, fromNotes: false };
  }
  const fromNotes = await noteTopics(course, studentId).catch((error) => {
    console.error("note topics:", error);
    return [];
  });
  return {
    base: fromNotes.map((t): BaseTopic => ({ title: t.title, source: "notes", notes: [t.note] })),
    fromSyllabus: false,
    fromNotes: fromNotes.length > 0,
  };
}
