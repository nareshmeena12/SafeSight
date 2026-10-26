import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/learning/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  cleanViva,
  markedText,
  storedVivaSchema,
  VIVA_SYSTEM_PROMPT,
  vivaOutputSchema,
  vivaPrompt,
  type VivaQuestion,
} from "./viva-schema";

type Db = SupabaseClient<Database>;

/** Saved viva questions for a submission, read under RLS (teacher-only), or null. */
export async function readVivaQuestions(db: Db, submissionId: string): Promise<VivaQuestion[] | null> {
  const { data } = await db.from("viva_questions").select("questions").eq("submission_id", submissionId).maybeSingle();
  if (!data) return null;
  const parsed = storedVivaSchema.safeParse(data.questions);
  return parsed.success ? parsed.data : null;
}

/**
 * Asks Lens for three viva questions about one submitted piece of work and
 * saves them. `db` is the teacher's own client: RLS proves the submission is
 * in their course. Returns null if it isn't visible or isn't submitted.
 */
export async function suggestVivaQuestions(db: Db, submissionId: string, teacherId: string) {
  const { data: submission } = await db
    .from("submissions")
    .select("id, content, submitted_at, assignment:assignments(title, instructions), report:integrity_reports(summary)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission?.submitted_at) return null;

  const text = markedText(submission.content);
  let questions: VivaQuestion[] | null = null;
  // Streamed JSON (generateJson), so the provider's slow-start retry doesn't cut a long answer off.
  for (let round = 0; round < 2 && !questions; round++) {
    const output = await generateJson({
      feature: "lens_viva",
      userId: teacherId,
      system: VIVA_SYSTEM_PROMPT,
      prompt:
        vivaPrompt({
          title: submission.assignment?.title ?? "Assignment",
          instructions: submission.assignment?.instructions ?? "",
          summary: submission.report?.summary ?? null,
          text: text || "(The submission is empty.)",
        }) + (round ? "\n\nKeep every word neutral and about understanding." : ""),
      schema: vivaOutputSchema,
      name: "viva_questions",
      timeoutMs: 30_000,
      maxOutputTokens: 2000,
      temperature: 0.4,
    });
    if (!output) break;
    const clean = cleanViva(output);
    if (clean) questions = clean.questions.map((q) => ({ ...q, discussedAt: null }));
  }
  if (!questions) return { questions: null };

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("viva_questions")
    .upsert({ submission_id: submissionId, questions, created_by: teacherId, created_at: now, updated_at: now }, { onConflict: "submission_id" });
  if (error) throw new Error(`viva_questions: ${error.message}`);
  return { questions };
}

/** Marks one question discussed (or not). RLS read proves the teacher; the service role writes. */
export async function markVivaQuestion(db: Db, submissionId: string, index: number, discussed: boolean) {
  const current = await readVivaQuestions(db, submissionId);
  if (!current || !current[index]) return null;
  const questions = current.map((q, i) => (i === index ? { ...q, discussedAt: discussed ? new Date().toISOString() : null } : q));
  const { error } = await createAdminClient()
    .from("viva_questions")
    .update({ questions, updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw new Error(`viva_questions: ${error.message}`);
  return questions;
}
