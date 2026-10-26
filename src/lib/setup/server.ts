import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { generateJson } from "@/lib/learning/ai";
import { MATERIALS_BUCKET, MAX_PDF_BYTES } from "@/lib/materials/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/teacher/queries";
import { linkTopicsToNotes } from "./link-notes";
import {
  EXTRACT_SYSTEM_PROMPT,
  SUGGEST_SYSTEM_PROMPT,
  cleanSuggestions,
  extractPrompt,
  readSuggestions,
  suggestPrompt,
  suggestionsOutputSchema,
  type Suggestion,
} from "./suggestions";
import { cleanTopicMap, extractionSchema, type SavedTopicMap, type TopicMapDraft } from "./topic-map";

/**
 * Course setup on the server (S22): read a syllabus into a draft topic map,
 * suggest assignments from the saved map, and link uploaded notes to topics.
 * Callers check the teacher owns the course (`teacherCourse`) first; writes
 * then go through the service role.
 */

export type TeacherCourse = { id: string; name: string; code: string; joinCode: string; teacherId: string };

/** The course, if the signed-in user (RLS client) teaches it. */
export async function teacherCourse(db: Db, userId: string, courseId: string): Promise<TeacherCourse | null> {
  const { data } = await db.from("courses").select("id, name, code, join_code, teacher_id").eq("id", courseId).maybeSingle();
  if (!data || data.teacher_id !== userId) return null;
  return { id: data.id, name: data.name, code: data.code, joinCode: data.join_code, teacherId: data.teacher_id };
}

/** Characters of syllabus text kept, and sent to the model. */
const STORED_TEXT_MAX = 60_000;
const MODEL_TEXT_MAX = 40_000;

export type SyllabusResult = { ok: true; draft: TopicMapDraft } | { ok: false; error: string };

/** Text of a syllabus PDF the teacher uploaded to the course's folder in Storage. */
export async function syllabusPdfText(path: string): Promise<{ text: string } | { error: string }> {
  const { data: file, error } = await createAdminClient().storage.from(MATERIALS_BUCKET).download(path);
  if (error || !file) return { error: "We couldn't read the uploaded file. Try uploading it again." };
  if (file.size > MAX_PDF_BYTES) return { error: "This PDF is larger than 25 MB. Paste the syllabus text instead." };
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    return { text: text.join("\n\n") };
  } catch {
    return { error: "This file doesn't look like a readable PDF. Try pasting the syllabus text instead." };
  }
}

/**
 * Asks the model for the syllabus's structure, tidies it and stores it as a
 * draft (`course_syllabi.extracted`) for the teacher to review. The saved
 * topic map isn't touched until the teacher saves.
 */
export async function readSyllabus({
  course,
  userId,
  source,
  text,
  path = null,
  fileName = "",
}: {
  course: TeacherCourse;
  userId: string;
  source: "pdf" | "text";
  text: string;
  path?: string | null;
  fileName?: string;
}): Promise<SyllabusResult> {
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.replace(/\s/g, "").length < 80) {
    return {
      ok: false,
      error:
        source === "pdf"
          ? "We couldn't find enough text in this PDF. If it's a scanned copy, paste the syllabus text instead."
          : "That's a bit short for a syllabus. Paste the units and topics, and the course outcomes if you have them.",
    };
  }

  const raw = await generateJson({
    feature: "syllabus_extract",
    userId,
    system: EXTRACT_SYSTEM_PROMPT,
    prompt: extractPrompt(clean.slice(0, MODEL_TEXT_MAX)),
    schema: extractionSchema,
    name: "topic_map",
    timeoutMs: 50_000,
    maxOutputTokens: 6000,
    temperature: 0.1,
  });
  if (!raw) return { ok: false, error: "We couldn't read the syllabus just now. Please try again in a minute." };
  const draft = cleanTopicMap(raw);
  if (!draft.units.length) {
    return { ok: false, error: "We couldn't find units or topics in this text. Check it's the syllabus, or add the topics by hand." };
  }

  const admin = createAdminClient();
  const { data: previous } = await admin.from("course_syllabi").select("file_path").eq("course_id", course.id).maybeSingle();
  if (previous?.file_path && previous.file_path !== path) {
    // Only the latest syllabus file is kept.
    await admin.storage.from(MATERIALS_BUCKET).remove([previous.file_path]);
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("course_syllabi").upsert(
    {
      course_id: course.id,
      source,
      file_path: path,
      file_name: fileName.slice(0, 200),
      source_text: clean.slice(0, STORED_TEXT_MAX),
      extracted: draft,
      extracted_at: now,
      created_by: userId,
      updated_at: now,
    },
    { onConflict: "course_id" },
  );
  if (error) {
    console.error("course_syllabi upsert:", error.message);
    return { ok: false, error: "We read the syllabus but couldn't save it. Please try again." };
  }
  return { ok: true, draft };
}

// ---------------------------------------------------------------- topic map

export type TopicNote = { materialId: string; title: string; pages: number[] };
export type TopicMapView = SavedTopicMap & { notes: Record<string, TopicNote[]> };

/** The saved topic map (RLS: the course teacher, or an enrolled student), with linked notes per topic. */
export async function readTopicMap(db: Db, courseId: string): Promise<TopicMapView> {
  const [units, topics, outcomes, links] = await Promise.all([
    db.from("course_units").select("id, title, position").eq("course_id", courseId).order("position"),
    db.from("course_topics").select("id, unit_id, title, position").eq("course_id", courseId).order("position"),
    db.from("course_outcomes").select("id, code, description, position").eq("course_id", courseId).order("position"),
    db
      .from("course_topic_materials")
      .select("topic_id, material_id, pages, score, material:materials(title)")
      .eq("course_id", courseId)
      .order("score", { ascending: false }),
  ]);
  const notes: Record<string, TopicNote[]> = {};
  for (const l of links.data ?? []) {
    const material = Array.isArray(l.material) ? l.material[0] : l.material;
    (notes[l.topic_id] ??= []).push({ materialId: l.material_id, title: material?.title ?? "Notes", pages: l.pages });
  }
  return {
    units: (units.data ?? []).map((u) => ({
      id: u.id,
      title: u.title,
      topics: (topics.data ?? []).filter((t) => t.unit_id === u.id).map((t) => ({ id: t.id, title: t.title })),
    })),
    outcomes: (outcomes.data ?? []).map((o) => ({ id: o.id, code: o.code, description: o.description })),
    notes,
  };
}

/** Recomputes which notes cover which topics (service role; the caller checked the teacher). */
export async function linkCourseNotes(courseId: string): Promise<{ topics: number; links: number }> {
  const admin = createAdminClient();
  const [topics, chunks] = await Promise.all([
    admin.from("course_topics").select("id, title").eq("course_id", courseId),
    admin
      .from("material_chunks")
      .select("material_id, page, content, materials!inner(course_id, status)")
      .eq("materials.course_id", courseId)
      .eq("materials.status", "ready")
      .limit(4000),
  ]);
  if (topics.error || chunks.error) throw new Error(topics.error?.message ?? chunks.error?.message);
  const links = linkTopicsToNotes(
    topics.data,
    chunks.data.map((c) => ({ materialId: c.material_id, page: c.page ?? 1, content: c.content })),
  );
  const { error: deleteError } = await admin.from("course_topic_materials").delete().eq("course_id", courseId);
  if (deleteError) throw new Error(deleteError.message);
  for (let i = 0; i < links.length; i += 200) {
    const { error } = await admin.from("course_topic_materials").insert(
      links.slice(i, i + 200).map((l) => ({
        topic_id: l.topicId,
        course_id: courseId,
        material_id: l.materialId,
        pages: l.pages,
        score: l.score,
      })),
    );
    if (error) throw new Error(error.message);
  }
  return { topics: new Set(links.map((l) => l.topicId)).size, links: links.length };
}

// ---------------------------------------------------------------- suggestions

export type SyllabusRow = {
  source: "pdf" | "text";
  fileName: string;
  extracted: TopicMapDraft | null;
  extractedAt: string | null;
  appliedAt: string | null;
  suggestions: Suggestion[];
  suggestedAt: string | null;
};

/** The teacher's syllabus row (RLS: course teacher only). */
export async function readSyllabusRow(db: Db, courseId: string): Promise<SyllabusRow | null> {
  const { data } = await db
    .from("course_syllabi")
    .select("source, file_name, extracted, extracted_at, applied_at, suggestions, suggested_at")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!data) return null;
  const extracted = data.extracted && typeof data.extracted === "object" ? (data.extracted as unknown as TopicMapDraft) : null;
  return {
    source: data.source === "pdf" ? "pdf" : "text",
    fileName: data.file_name,
    extracted: extracted && Array.isArray(extracted.units) ? extracted : null,
    extractedAt: data.extracted_at,
    appliedAt: data.applied_at,
    suggestions: readSuggestions(data.suggestions),
    suggestedAt: data.suggested_at,
  };
}

/** Suggests assignments per unit of the saved map; keeps the ones already used. Null when the model failed. */
export async function suggestAssignments(db: Db, course: TeacherCourse, userId: string): Promise<Suggestion[] | null> {
  const map = await readTopicMap(db, course.id);
  const draft = {
    units: map.units.map((u) => ({ title: u.title, topics: u.topics.map((t) => t.title) })),
    outcomes: map.outcomes.map((o) => ({ code: o.code, description: o.description })),
  };
  if (!draft.units.length) return [];
  const raw = await generateJson({
    feature: "assignment_suggest",
    userId,
    system: SUGGEST_SYSTEM_PROMPT,
    prompt: suggestPrompt(course.code ? `${course.code} ${course.name}` : course.name, draft),
    schema: suggestionsOutputSchema,
    name: "assignment_suggestions",
    timeoutMs: 45_000,
    maxOutputTokens: 5000,
    temperature: 0.5,
  });
  if (!raw) return null;
  const fresh = cleanSuggestions(raw, draft, () => crypto.randomUUID());
  if (!fresh.length) return null;

  const admin = createAdminClient();
  const { data: row } = await admin.from("course_syllabi").select("source, suggestions").eq("course_id", course.id).maybeSingle();
  const kept = readSuggestions(row?.suggestions).filter((s) => s.status === "used");
  const suggestions = [...fresh, ...kept].slice(0, 24);
  const now = new Date().toISOString();
  const { error } = await admin.from("course_syllabi").upsert(
    {
      course_id: course.id,
      source: row?.source ?? "text",
      suggestions,
      suggested_at: now,
      created_by: userId,
      updated_at: now,
    },
    { onConflict: "course_id" },
  );
  if (error) throw new Error(error.message);
  return suggestions;
}

/** Marks a suggestion used or dismissed (service role; the caller checked the teacher). */
export async function setSuggestionStatus(courseId: string, suggestionId: string, status: "used" | "dismissed") {
  const admin = createAdminClient();
  const { data: row } = await admin.from("course_syllabi").select("suggestions").eq("course_id", courseId).maybeSingle();
  if (!row) return false;
  const list = readSuggestions(row.suggestions);
  if (!list.some((s) => s.id === suggestionId)) return false;
  const next = list.map((s) => (s.id === suggestionId ? { ...s, status } : s));
  const { error } = await admin
    .from("course_syllabi")
    .update({ suggestions: next, updated_at: new Date().toISOString() })
    .eq("course_id", courseId);
  return !error;
}

// ---------------------------------------------------------------- checklist

/** Counts for the setup checklist (RLS: the course teacher). */
export async function setupProgress(db: Db, courseId: string) {
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [topics, notes, assignments, students, invites] = await Promise.all([
    count(db.from("course_topics").select("id", { count: "exact", head: true }).eq("course_id", courseId)),
    count(db.from("materials").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "ready")),
    count(db.from("assignments").select("id", { count: "exact", head: true }).eq("course_id", courseId)),
    count(db.from("enrollments").select("student_id", { count: "exact", head: true }).eq("course_id", courseId)),
    count(db.from("course_invites").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "pending")),
  ]);
  return { topics, notes, assignments, students, invites };
}
