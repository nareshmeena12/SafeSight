"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, type FormState } from "@/lib/teacher/schemas";
import { inviteTeachers, queueTeacherInviteEmails, type InviteSummary } from "./invites";
import { adminContext } from "./queries";
import {
  courseDepartmentSchema,
  departmentIdSchema,
  departmentSchema,
  inviteFormSchema,
  inviteIdSchema,
  policySchema,
  teacherDepartmentSchema,
} from "./schemas";

/**
 * Admin server actions (S23). Each one checks the role, validates its input
 * with zod and writes through the admin's own client, so RLS and the admin_*
 * functions decide what may change (only their own institution). Invites are
 * the exception: they need the service role (lib/admin/invites.ts).
 */

const tryAgain = "That didn't save. Please try again in a moment.";
const noInstitution = "Your account isn't linked to an institution yet. Write to us and we'll set it up.";

export async function saveDepartment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = departmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { db, institution } = await adminContext();
  if (!institution) return { status: "error", message: noInstitution };
  const { departmentId, name, code } = parsed.data;

  const { data, error } = departmentId
    ? await db
        .from("departments")
        .update({ name, code, updated_at: new Date().toISOString() })
        .eq("id", departmentId)
        .select("id")
    : await db.from("departments").insert({ institution_id: institution.id, name, code }).select("id");
  if (error?.code === "23505") return { status: "error", fieldErrors: { name: "There's already a department with that name." } };
  if (error || !data?.length) return { status: "error", message: tryAgain };
  if (!departmentId) redirect(`/admin/departments/${data[0].id}`);
  refresh();
  return { status: "success", message: "Department updated." };
}

/** Deleting a department leaves its teachers and courses without one (and its policy goes). */
export async function deleteDepartment(formData: FormData): Promise<void> {
  const parsed = departmentIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await adminContext();
  await db.from("departments").delete().eq("id", parsed.data.departmentId);
  redirect("/admin/departments");
}

export async function savePolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = policySchema.safeParse({ ...Object.fromEntries(formData), allowedModes: formData.getAll("allowedModes") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { user, db, institution } = await adminContext();
  if (!institution) return { status: "error", message: noInstitution };
  const p = parsed.data;
  const row = {
    allowed_modes: p.allowedModes,
    default_mode: p.defaultMode,
    max_hint_level: p.maxHintLevel,
    worked_examples: p.workedExamples,
    lab_mode_allowed: p.labModeAllowed,
    teachers_can_loosen: p.teachersCanLoosen,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  // The unique index is on an expression (department or college), so no upsert.
  const existing = db.from("ai_policies").select("id").eq("institution_id", institution.id);
  const { data: found } = await (p.departmentId ? existing.eq("department_id", p.departmentId) : existing.is("department_id", null)).maybeSingle();
  const { error } = found
    ? await db.from("ai_policies").update(row).eq("id", found.id)
    : await db.from("ai_policies").insert({ ...row, institution_id: institution.id, department_id: p.departmentId });
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return {
    status: "success",
    message: "Policy saved. New assignments start from it, and teachers can't go looser than it unless you allow that.",
  };
}

/** A department goes back to following the college default. */
export async function clearDepartmentPolicy(formData: FormData): Promise<void> {
  const parsed = departmentIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db, institution } = await adminContext();
  if (!institution) return;
  await db.from("ai_policies").delete().eq("institution_id", institution.id).eq("department_id", parsed.data.departmentId);
  redirect(`/admin/departments/${parsed.data.departmentId}?reset=${Date.now()}`);
}

export async function setTeacherDepartment(formData: FormData): Promise<void> {
  const parsed = teacherDepartmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await adminContext();
  await db.rpc("admin_set_teacher_department", {
    p_teacher_id: parsed.data.teacherId,
    p_department_id: parsed.data.departmentId,
  });
  refresh();
}

export async function setCourseDepartment(formData: FormData): Promise<void> {
  const parsed = courseDepartmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await adminContext();
  await db.rpc("admin_set_course_department", {
    p_course_id: parsed.data.courseId,
    p_department_id: parsed.data.departmentId,
  });
  refresh();
}

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<string, string>> }
  | { status: "success"; summary: InviteSummary };

export async function sendTeacherInvites(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const parsed = inviteFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { user, institution } = await adminContext();
  if (!institution) return { status: "error", message: noInstitution };
  const result = await inviteTeachers(institution, user.id, parsed.data.emails, parsed.data.departmentId);
  if ("error" in result) return { status: "error", message: result.error };
  refresh();
  return { status: "success", summary: result };
}

export async function removeTeacherInvite(formData: FormData): Promise<void> {
  const parsed = inviteIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db } = await adminContext();
  // Removing a joined invite doesn't change the teacher's account.
  await db.from("teacher_invites").delete().eq("id", parsed.data.inviteId);
  refresh();
}

export async function emailTeacherInviteAgain(formData: FormData): Promise<void> {
  const parsed = inviteIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { db, institution } = await adminContext();
  if (!institution) return;
  const { data } = await db.from("teacher_invites").select("email").eq("id", parsed.data.inviteId).maybeSingle();
  if (!data) return;
  queueTeacherInviteEmails(institution, [data.email]);
  refresh();
}
