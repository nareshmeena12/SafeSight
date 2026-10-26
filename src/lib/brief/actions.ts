"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { answerQuiz, findQuizByCode } from "./quiz";
import { answerQuizSchema, quizCodeSchema } from "./quiz-schema";

export type JoinState = { status: "idle" | "error"; message?: string };

/** A student types the code from the screen and lands on the quiz. */
export async function joinQuiz(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const user = await requireRole(["student"]);
  const code = quizCodeSchema.safeParse(formData.get("code") ?? "");
  if (!code.success) return { status: "error", message: code.error.issues[0]?.message };
  const found = await findQuizByCode(await createClient(), user.id, code.data);
  if (found.status === "not_found") {
    return { status: "error", message: "No quiz is running with that code. Check the number on the screen." };
  }
  if (found.status === "not_enrolled") {
    return { status: "error", message: "This quiz is for a course you haven't joined. Ask your teacher for the class code." };
  }
  redirect(`/student/quiz/${found.sessionId}`);
}

/** Saves one answer (changeable until the teacher closes the quiz). */
export async function submitQuizAnswer(input: z.infer<typeof answerQuizSchema>) {
  const user = await requireRole(["student"]);
  const parsed = answerQuizSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "That didn't come through. Please try again." };
  const { sessionId, index, choice } = parsed.data;
  try {
    const result = await answerQuiz(await createClient(), user.id, sessionId, index, choice);
    if (result === "ok") return { ok: true as const };
    if (result === "closed") return { ok: false as const, message: "Your teacher has closed this quiz.", closed: true };
    return { ok: false as const, message: "This quiz wasn't found." };
  } catch (e) {
    console.error("Quiz answer failed", e);
    return { ok: false as const, message: "That didn't save. Please try again." };
  }
}

/** The teacher's choice for the Monday email (RLS: their own row). */
export async function setWeeklyEmail(formData: FormData) {
  const user = await requireRole(["teacher"]);
  const on = formData.get("weeklyEmail") === "on";
  const db = await createClient();
  const { error } = await db
    .from("teacher_digest_prefs")
    .upsert({ teacher_id: user.id, weekly_email: on, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" });
  if (error) console.error("digest prefs", error.message);
  refresh();
}
