import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { roleSchema, type Role } from "./roles";
import { joinCodeSchema } from "./schemas";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Joins the courses whose teacher invited this email from a class list (S22,
 * `claim_course_invites`; only for a confirmed email) and the course whose
 * class code a student typed at sign-up (kept in user metadata as
 * `join_code`), then clears the code. Runs right after sign-up when a session
 * exists, when the confirmation link is opened, and at log-in. Never throws:
 * a wrong or expired code just means the student adds it later.
 */
export async function joinPendingCourse(supabase: ServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const claimed = await supabase.rpc("claim_course_invites");
    if (claimed.error) console.warn("claim_course_invites failed:", claimed.error.message);
  }
  const code = joinCodeSchema.safeParse(user?.user_metadata?.join_code);
  if (!user || !code.success) return;

  const { error } = await supabase.rpc("join_course", { p_join_code: code.data });
  if (error) console.warn("join_course after sign-up failed:", error.message);
  await supabase.auth.updateUser({ data: { join_code: null } });
}

/**
 * S23: an admin invited this email as a teacher (`teacher_invites`). Claims
 * the invite for a confirmed email: the account becomes a teacher of that
 * institution and department. Returns the role afterwards (the given role
 * when nothing changed or the call failed). Never throws.
 */
export async function claimTeacherInvites(supabase: ServerClient, role: Role): Promise<Role> {
  const { data, error } = await supabase.rpc("claim_teacher_invites");
  if (error) {
    console.warn("claim_teacher_invites failed:", error.message);
    return role;
  }
  return roleSchema.safeParse(data).data ?? role;
}
