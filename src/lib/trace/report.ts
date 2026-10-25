import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { measureHtml } from "./html";
import { computeMetrics, type TimedEvent, type TraceMetrics } from "./metrics";
import { traceModel } from "./model";
import { fetchPaged } from "./paged";
import { formatClock, formatPercent, templateSummary, usesBannedWords } from "./summary";

const TRACE_SYSTEM_PROMPT = `You are Trace, the writing-process analyst in SafeSight, an education app for Indian colleges.
You receive measured facts about how a student wrote one submission in the Trace editor.
Write a short evidence summary for the teacher: 2 or 3 plain sentences, under 70 words.

Rules:
- Report only the facts you are given. Never invent numbers, times or events.
- Be neutral. Describe what happened, not what it means. The teacher decides.
- Never judge the student, guess where pasted text came from, or suggest wrongdoing. No accusing or alarming words.
- Mention sessions and active time, then pastes (time, size, share of the final text), then the share of pasted text in the final text.
- Use the times exactly as given (Indian Standard Time, 24-hour).

Example: "Written over 3 sessions, 52 minutes active. One paste at 14:32 added 1,240 characters, about 78% of the final length. Pasted text makes up 70% of the final text."`;

const summarySchema = z.object({
  summary: z.string().min(10).max(600),
});

/** Facts in the form the model sees them (already formatted, so it copies rather than computes). */
export function factsForModel(m: TraceMetrics) {
  return {
    sessions: m.sessions,
    active_minutes: Math.round(m.activeMinutes),
    final_text_characters: m.finalChars,
    typed_characters: m.typedChars,
    deleted_characters: m.deletedChars,
    pasted_text_share_of_final_text: formatPercent(m.pasteRatio),
    pastes: m.pastes.map((p) => ({
      time: formatClock(p.at),
      characters: p.size,
      about_share_of_final_length: formatPercent(p.shareOfFinal),
    })),
  };
}

/** Asks the model for the summary; falls back to the template on any problem. */
export async function writeSummary(
  m: TraceMetrics,
  /** Who asked (for ai_usage): the student on submit, the teacher on a re-run. */
  userId: string | null = null,
): Promise<{ summary: string; source: "model" | "template" }> {
  const fallback = { summary: templateSummary(m), source: "template" as const };
  const model = traceModel(userId);
  if (!model || m.firstAt === null || m.finalChars === 0) return fallback;

  try {
    const { output } = await generateText({
      model,
      system: TRACE_SYSTEM_PROMPT,
      prompt: `Facts (JSON):\n${JSON.stringify(factsForModel(m), null, 2)}\n\nReturn JSON: {"summary": "..."}`,
      output: Output.object({ schema: summarySchema }),
      temperature: 0.2,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const summary = output.summary.trim();
    if (usesBannedWords(summary)) return fallback;
    return { summary, source: "model" };
  } catch (error) {
    console.error("Trace summary: model call failed, using the template", error);
    return fallback;
  }
}

/**
 * The Trace agent: reads a submitted piece of work and its recorded events,
 * computes the evidence numbers and writes the integrity report. Runs with
 * the service role — callers must already have checked who is asking.
 */
export async function generateIntegrityReport(submissionId: string, userId: string | null = null) {
  const db = createAdminClient();

  const { data: submission, error } = await db
    .from("submissions")
    .select("id, content, submitted_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  if (!submission?.submitted_at) return null;

  const events = await fetchAllEvents(db, submissionId);
  const metrics = computeMetrics(events, measureHtml(submission.content));
  const { summary } = await writeSummary(metrics, userId);

  const report = {
    submission_id: submissionId,
    paste_ratio: metrics.pasteRatio,
    active_minutes: metrics.activeMinutes,
    sessions: metrics.sessions,
    summary,
  };
  const { error: upsertError } = await db
    .from("integrity_reports")
    .upsert(report, { onConflict: "submission_id" });
  if (upsertError) throw upsertError;
  return report;
}

async function fetchAllEvents(
  db: ReturnType<typeof createAdminClient>,
  submissionId: string,
): Promise<TimedEvent[]> {
  const rows = await fetchPaged((from, to) =>
    db
      .from("writing_events")
      .select("type, size, at")
      .eq("submission_id", submissionId)
      .order("at")
      .order("id")
      .range(from, to),
  );
  return rows.map((e) => ({ type: e.type, size: e.size, at: Date.parse(e.at) }));
}
