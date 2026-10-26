import { z } from "zod";

/**
 * S21 "Ask a human": the pure parts. Request schemas, the summary prompt,
 * a fallback summary when the model is off, and the student-facing email.
 * Tested in schemas.test.ts.
 */

export const DOUBT_STATUSES = ["open", "answered", "resolved"] as const;
export type DoubtStatus = (typeof DOUBT_STATUSES)[number];

/** Doubts a student may send per day, and summaries they may ask for per hour. */
export const DOUBTS_PER_DAY = 10;
export const SUMMARIES_PER_HOUR = 10;

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);

export const draftRequestSchema = z.object({ conversationId: z.uuid() });

export const createDoubtSchema = z.object({
  courseId: z.uuid(),
  assignmentId: z.uuid().nullish(),
  conversationId: z.uuid().nullish(),
  question: text(1000).min(5, "Write your question in a few words."),
  tried: text(1500).default(""),
  stuckOn: text(1000).default(""),
  shareChat: z.boolean().default(false),
});
export type CreateDoubt = z.infer<typeof createDoubtSchema>;

/** What the model writes from the chat; the student edits it before sending. */
export const doubtSummarySchema = z.object({
  question: z.string().max(1200),
  tried: z.string().max(1600),
  stuckOn: z.string().max(1200),
});
export type DoubtSummary = z.infer<typeof doubtSummarySchema>;

export const answerSchema = z.object({
  doubtId: z.uuid(),
  answer: text(4000).min(2, "Write an answer first."),
});

export const statusSchema = z.object({
  doubtId: z.uuid(),
  status: z.enum(DOUBT_STATUSES),
});

export const announceSchema = z.object({
  courseId: z.uuid(),
  doubtIds: z.array(z.uuid()).min(1).max(100),
  title: text(200).min(3, "Give the announcement a short title."),
  body: text(6000).min(10, "Write the answer for the class."),
});

export const taSchema = z.object({
  courseId: z.uuid(),
  email: z.email("Enter the email they use for SafeSight.").trim().max(254),
});
export const removeTaSchema = z.object({ courseId: z.uuid(), userId: z.uuid() });

export type ChatLine = { role: "user" | "assistant"; content: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The chat as the model sees it: the last 24 messages, each cut to 600 characters. */
export function chatTranscript(lines: readonly ChatLine[]): string {
  return lines
    .slice(-24)
    .map((l) => `${l.role === "user" ? "STUDENT" : "SAGE"}: ${clip(l.content.replace(/\s+/g, " ").trim(), 600)}`)
    .join("\n");
}

export const SUMMARY_SYSTEM = `You help a college student ask their teacher a question (ASK-A-HUMAN).
You get the student's chat with Sage, an AI tutor. Write a short summary the student will check and send to their teacher.
Return JSON only: {"question": string, "tried": string, "stuckOn": string}.
- "question": the student's actual question in one or two sentences, in the first person ("How do I…").
- "tried": what the student themselves tried or worked out, in 1–3 short sentences, first person. Use only what the STUDENT wrote; "" if they didn't try anything yet.
- "stuckOn": the exact point where they are stuck, in one sentence, first person.
- Plain, neutral words. Don't judge the student, don't mention Sage's rules, and don't add an answer or a solution.
- Keep numbers and formulas the student wrote. Never add values that aren't in the student's messages.`;

export function summaryPrompt(context: { course: string; assignment: string | null }, lines: readonly ChatLine[]) {
  return `Course: ${context.course}
${context.assignment ? `Assignment: ${context.assignment}` : "Chat: general questions about the course"}

The chat (oldest first):
"""
${chatTranscript(lines)}
"""`;
}

/** Without a model: the latest real question and the student's own earlier messages. */
export function fallbackSummary(lines: readonly ChatLine[]): DoubtSummary {
  const student = lines.filter((l) => l.role === "user").map((l) => l.content.replace(/\s+/g, " ").trim()).filter(Boolean);
  const question = [...student].reverse().find((s) => s.length >= 12) ?? student.at(-1) ?? "";
  const tried = student.filter((s) => s !== question && /\d|=|i (tried|got|used|think)|my (working|answer)/i.test(s));
  return {
    question: clip(question, 1000),
    tried: clip(tried.slice(-3).join(" "), 1500),
    stuckOn: "",
  };
}

/** Trims the model's summary to the stored limits. */
export function tidySummary(s: DoubtSummary): DoubtSummary {
  const t = (v: string, n: number) => clip(v.replace(/[ \t]+/g, " ").trim(), n);
  return { question: t(s.question, 1000), tried: t(s.tried, 1500), stuckOn: t(s.stuckOn, 1000) };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The email a student gets when their question is answered (only if email is configured). */
export function answerEmail({
  studentFirstName,
  course,
  question,
  answer,
  answeredBy,
  link,
  announcement,
}: {
  studentFirstName: string;
  course: string;
  question: string;
  answer: string;
  answeredBy: string;
  link: string;
  announcement: boolean;
}) {
  const hi = studentFirstName ? `Hi ${studentFirstName},` : "Hi,";
  const intro = announcement
    ? `${answeredBy || "Your teacher"} answered your question in ${course} for the whole class.`
    : `${answeredBy || "Your teacher"} answered your question in ${course}.`;
  const subject = `Your question in ${course} has an answer`;
  const text = `${hi}\n\n${intro}\n\nYou asked:\n${question}\n\nAnswer:\n${answer}\n\nSee it in SafeSight: ${link}\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#14161F;max-width:560px">
<p>${esc(hi)}</p><p>${esc(intro)}</p>
<p style="margin:16px 0 4px;color:#6B6F7B;font-size:14px">You asked</p>
<p style="margin:0;white-space:pre-wrap">${esc(question)}</p>
<p style="margin:16px 0 4px;color:#6B6F7B;font-size:14px">Answer</p>
<p style="margin:0;white-space:pre-wrap">${esc(answer)}</p>
<p style="margin-top:24px"><a href="${esc(link)}" style="color:#1F6F5C">Open it in SafeSight</a></p>
</div>`;
  return { subject, text, html };
}
