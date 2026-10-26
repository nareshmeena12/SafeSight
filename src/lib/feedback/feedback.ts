import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/learning/ai";
import { markedText } from "@/lib/lens/viva-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  assembleFeedback,
  DEFAULT_RUBRIC,
  FEEDBACK_SYSTEM_PROMPT,
  feedbackOutputSchema,
  feedbackPrompt,
  parseRubric,
  storedCriteriaSchema,
  type Feedback,
  type SaveFeedback,
} from "./rubric";

type Db = SupabaseClient<Database>;

type Row = Database["public"]["Tables"]["feedback_drafts"]["Row"];

function toFeedback(row: Row): Feedback {
  const criteria = storedCriteriaSchema.safeParse(row.criteria);
  return {
    criteria: criteria.success ? criteria.data : [],
    overall: row.overall,
    status: row.status === "approved" ? "approved" : "draft",
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Feedback on a submission as the reader may see it: the course teacher sees
 * drafts, the student only approved feedback (RLS on feedback_drafts).
 */
export async function readFeedback(db: Db, submissionId: string): Promise<Feedback | null> {
  const { data } = await db.from("feedback_drafts").select("*").eq("submission_id", submissionId).maybeSingle();
  return data ? toFeedback(data) : null;
}

/** The submission with its assignment, read under the teacher's RLS (null if not theirs or not submitted). */
async function teacherSubmission(db: Db, submissionId: string) {
  const { data } = await db
    .from("submissions")
    .select("id, content, submitted_at, assignment:assignments(id, title, instructions, rubric, notes:assignment_teacher_notes(answer_key))")
    .eq("id", submissionId)
    .maybeSingle();
  if (!data?.submitted_at || !data.assignment) return null;
  return data;
}

/**
 * Asks Lens for feedback per rubric criterion and saves it as a draft
 * (replacing an earlier draft; approved feedback is never overwritten here).
 * Returns null when the submission isn't the teacher's, "approved" when the
 * feedback is already shared, or the draft (feedback null if the model gave
 * nothing usable).
 */
export async function draftFeedback(db: Db, submissionId: string, teacherId: string) {
  const submission = await teacherSubmission(db, submissionId);
  if (!submission?.assignment) return null;
  const existing = await readFeedback(db, submissionId);
  if (existing?.status === "approved") return { status: "approved" as const };

  const { assignment } = submission;
  const parsed = parseRubric(assignment.rubric ?? "");
  const rubric = parsed.length > 0 ? parsed : DEFAULT_RUBRIC;
  const notes = Array.isArray(assignment.notes) ? assignment.notes[0] : assignment.notes;
  // Feedback is about the work itself, so paste markers are left out.
  const text = markedText(submission.content).replace(/\[\/?pasted\]/g, "");

  let draft: ReturnType<typeof assembleFeedback> = null;
  for (let round = 0; round < 2 && !draft; round++) {
    const output = await generateJson({
      feature: "feedback_draft",
      userId: teacherId,
      system: FEEDBACK_SYSTEM_PROMPT,
      prompt:
        feedbackPrompt({
          title: assignment.title,
          instructions: assignment.instructions ?? "",
          rubric,
          answerKey: notes?.answer_key ?? "",
          text: text || "(The submission is empty.)",
        }) + (round ? `\n\nReturn exactly ${rubric.length} criteria, in order, and keep every word neutral.` : ""),
      schema: feedbackOutputSchema,
      name: "feedback_draft",
      timeoutMs: 35_000,
      maxOutputTokens: 2500,
      temperature: 0.3,
    });
    if (!output) break;
    draft = assembleFeedback(output, rubric);
  }
  if (!draft) return { status: "draft" as const, feedback: null };

  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("feedback_drafts")
    .upsert(
      { submission_id: submissionId, criteria: draft.criteria, overall: draft.overall, status: "draft", created_by: teacherId, approved_by: null, approved_at: null, updated_at: now },
      { onConflict: "submission_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`feedback_drafts: ${error.message}`);
  return { status: "draft" as const, feedback: { ...toFeedback(data), generalCriteria: parsed.length === 0 } };
}

/**
 * Saves the teacher's edited feedback. `status: "approved"` shares it with the
 * student; "draft" keeps (or takes) it back to the teacher only.
 */
export async function saveFeedback(db: Db, input: SaveFeedback, teacherId: string) {
  const submission = await teacherSubmission(db, input.submissionId);
  if (!submission) return null;
  const now = new Date().toISOString();
  const approved = input.status === "approved";
  const { data, error } = await createAdminClient()
    .from("feedback_drafts")
    .upsert(
      {
        submission_id: input.submissionId,
        criteria: input.criteria,
        overall: input.overall,
        status: input.status,
        approved_by: approved ? teacherId : null,
        approved_at: approved ? now : null,
        updated_at: now,
      },
      { onConflict: "submission_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`feedback_drafts: ${error.message}`);
  return toFeedback(data);
}

/** The rubric the draft will follow, for the card (parsed criteria, or null = the general ones). */
export async function rubricForSubmission(db: Db, submissionId: string) {
  const submission = await teacherSubmission(db, submissionId);
  if (!submission?.assignment) return null;
  const parsed = parseRubric(submission.assignment.rubric ?? "");
  return parsed.length > 0 ? parsed : null;
}
