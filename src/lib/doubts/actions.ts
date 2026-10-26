"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { courseRole, doubtForStaff, notify, tellStudent } from "./data";
import { announceSchema, answerSchema, removeTaSchema, statusSchema, taSchema } from "./schemas";

/**
 * S21 server actions. Each one validates with zod, proves access under
 * row-level security (the doubt is readable and the user teaches or assists
 * its course), then writes with the service role.
 */

export type ActionState = { status: "idle" | "success" | "error"; message?: string };

const tryAgain = "That didn't save. Please try again in a moment.";

async function signedIn() {
  const user = await getCurrentUser();
  return user ? { user, db: await createClient() } : null;
}

/** Answer one doubt; the student is told in-app (and by email when configured). */
export async function answerDoubt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = answerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? tryAgain };
  const session = await signedIn();
  if (!session) return { status: "error", message: "Please sign in again." };
  const found = await doubtForStaff(session.db, session.user.id, parsed.data.doubtId);
  if (!found) return { status: "error", message: "We couldn't find this question in your courses." };

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("doubts")
    .update({
      answer: parsed.data.answer,
      answered_by: session.user.id,
      answered_by_name: session.user.fullName,
      answered_at: now,
      status: found.doubt.status === "resolved" ? "resolved" : "answered",
      updated_at: now,
    })
    .eq("id", found.doubt.id);
  if (error) return { status: "error", message: tryAgain };

  const d = found.doubt;
  after(() =>
    tellStudent({
      studentId: d.student_id,
      studentName: d.student_name,
      courseId: d.course_id,
      question: d.question,
      answer: parsed.data.answer,
      answeredBy: session.user.fullName,
      announcement: false,
    }),
  );
  refresh();
  return { status: "success", message: "Answer sent." };
}

/** Mark resolved, or reopen. Staff may do either; the student may resolve or reopen their own. */
export async function setDoubtStatus(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const session = await signedIn();
  if (!session) return;
  const { data: own } = await session.db
    .from("doubts")
    .select("id, student_id, answer")
    .eq("id", parsed.data.doubtId)
    .eq("student_id", session.user.id)
    .maybeSingle();
  const staff = own ? null : await doubtForStaff(session.db, session.user.id, parsed.data.doubtId);
  const doubt = own ?? staff?.doubt;
  if (!doubt) return;

  const status = parsed.data.status === "open" && doubt.answer ? "answered" : parsed.data.status;
  const now = new Date().toISOString();
  await createAdminClient()
    .from("doubts")
    .update({ status, resolved_at: status === "resolved" ? now : null, updated_at: now })
    .eq("id", doubt.id);
  refresh();
}

/**
 * Many students asked the same thing: post one answer to the whole course and
 * mark those doubts answered with it. Everyone who asked is told.
 */
export async function announceFromDoubts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = announceSchema.safeParse({
    courseId: formData.get("courseId"),
    doubtIds: formData.getAll("doubtIds"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? tryAgain };
  const session = await signedIn();
  if (!session) return { status: "error", message: "Please sign in again." };
  const { courseId, doubtIds, title, body } = parsed.data;
  if (!(await courseRole(session.db, session.user.id, courseId))) {
    return { status: "error", message: "We couldn't find this course in your list." };
  }
  // Only doubts this user can read in this course (RLS), so ids from elsewhere are ignored.
  const { data: doubts } = await session.db
    .from("doubts")
    .select("id, student_id, student_name, question, status")
    .eq("course_id", courseId)
    .in("id", doubtIds);
  if (!doubts?.length) return { status: "error", message: "Those questions are no longer in the queue." };

  const admin = createAdminClient();
  const { data: announcement, error } = await admin
    .from("course_announcements")
    .insert({ course_id: courseId, title, body, created_by: session.user.id, created_by_name: session.user.fullName, doubts: doubts.length })
    .select("id")
    .single();
  if (error) return { status: "error", message: tryAgain };

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("doubts")
    .update({
      answer: `${title}\n\n${body}`.slice(0, 4000),
      answered_by: session.user.id,
      answered_by_name: session.user.fullName,
      answered_at: now,
      announcement_id: announcement.id,
      status: "answered",
      updated_at: now,
    })
    .in(
      "id",
      doubts.map((d) => d.id),
    )
    .neq("status", "resolved");
  if (updateError) return { status: "error", message: tryAgain };

  // One notice per student, even if they asked twice.
  const seen = new Set<string>();
  const askers = doubts.filter((d) => !seen.has(d.student_id) && seen.add(d.student_id));
  after(() =>
    Promise.all(
      askers.map((d) =>
        tellStudent({
          studentId: d.student_id,
          studentName: d.student_name,
          courseId,
          question: d.question,
          answer: body,
          answeredBy: session.user.fullName,
          announcement: true,
        }),
      ),
    ),
  );
  refresh();
  return { status: "success", message: `Posted to the class. ${askers.length} ${askers.length === 1 ? "student was" : "students were"} told.` };
}

/** A teacher makes someone a teaching assistant for one course (they need a SafeSight account). */
export async function addTa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? tryAgain };
  const session = await signedIn();
  if (!session) return { status: "error", message: "Please sign in again." };
  const { courseId, email } = parsed.data;
  if ((await courseRole(session.db, session.user.id, courseId)) !== "teacher") {
    return { status: "error", message: "Only the course's teacher can add teaching assistants." };
  }

  const admin = createAdminClient();
  const { data: found } = await admin.rpc("find_user_by_email", { p_email: email });
  const person = found?.[0];
  if (!person) {
    return { status: "error", message: "No SafeSight account uses that email yet. Ask them to sign up first, then add them here." };
  }
  if (person.id === session.user.id) return { status: "error", message: "You already teach this course." };

  const { error } = await admin
    .from("course_tas")
    .upsert(
      { course_id: courseId, user_id: person.id, full_name: person.full_name, email: email.toLowerCase(), added_by: session.user.id },
      { onConflict: "course_id,user_id" },
    );
  if (error) return { status: "error", message: tryAgain };

  const { data: course } = await admin.from("courses").select("name, code").eq("id", courseId).maybeSingle();
  const name = course ? `${course.code ? `${course.code} ` : ""}${course.name}` : "a course";
  after(() =>
    notify([
      {
        userId: person.id,
        kind: "ta_added",
        title: `You're now a teaching assistant for ${name}`,
        body: "You can answer students' questions and see the course overview.",
        link: person.role === "student" ? `/student/ta/${courseId}` : `/teacher/doubts?course=${courseId}`,
      },
    ]),
  );
  refresh();
  return { status: "success", message: `${person.full_name || email} can now answer questions in this course.` };
}

export async function removeTa(formData: FormData): Promise<void> {
  const parsed = removeTaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const session = await signedIn();
  if (!session) return;
  if ((await courseRole(session.db, session.user.id, parsed.data.courseId)) !== "teacher") return;
  await createAdminClient().from("course_tas").delete().eq("course_id", parsed.data.courseId).eq("user_id", parsed.data.userId);
  refresh();
}

/** Marks the user's own notices read (RLS + a column grant on read_at). */
export async function markNotificationsRead(): Promise<void> {
  const session = await signedIn();
  if (!session) return;
  await session.db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .is("read_at", null);
}
