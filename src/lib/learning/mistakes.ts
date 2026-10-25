import "server-only";
import { generateJson } from "./ai";
import { readMistakes, recordMistake } from "./data";
import { mistakePrompt, mistakeSystem } from "./prompts";
import { mistakeJsonShape, mistakeOutputSchema } from "./schemas";

/**
 * The mistake log, from Sage chats: after Sage checks a student's working
 * (a "check work" reply), a cheap structured call names the error pattern, if
 * any, reusing one of the student's existing patterns when it's the same.
 * Runs in the background after the reply has gone out.
 */
export async function logMistakeFromTurn({
  studentId,
  courseId,
  working,
  reply,
  topic,
}: {
  studentId: string;
  courseId: string;
  working: string;
  reply: string;
  topic: string;
}) {
  const existing = await readMistakes(studentId, courseId, 15);
  const out = await generateJson({
    feature: "sage_mistake",
    userId: studentId,
    system: mistakeSystem(mistakeJsonShape),
    prompt: mistakePrompt({ existing: existing.map((m) => m.label), working, reply }),
    schema: mistakeOutputSchema,
    name: "mistake",
    maxOutputTokens: 2000,
    temperature: 0,
    timeoutMs: 25_000,
  });
  if (!out?.found || !out.pattern.trim()) return;
  const ref = out.sameAs?.match(/^M(\d+)$/i);
  const sameAs = ref ? existing[Number(ref[1]) - 1]?.id ?? null : null;
  await recordMistake({ studentId, courseId, label: out.pattern, topic: out.topic || topic, sameAsId: sameAs, existing });
}
