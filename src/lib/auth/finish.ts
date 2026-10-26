import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { joinPendingCourse } from "./join";
import { roleSchema, type Role } from "./roles";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Runs after every sign-in (password, email link, Google, Microsoft):
 * `apply_account_claims` applies a pending staff invite and the institution of
 * the email's domain (S25), the session is refreshed when that changed the
 * role (so the JWT's app_metadata copy is current), then students join their
 * pending courses (S22). Returns the role, or null when there is no profile.
 */
export async function finishSignIn(supabase: ServerClient): Promise<Role | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const claims = await supabase.rpc("apply_account_claims");
  if (claims.error) console.warn("apply_account_claims failed:", claims.error.message);
  const result = (claims.data ?? null) as { role?: string; changed?: boolean } | null;
  if (result?.changed) await supabase.auth.refreshSession();

  let role = roleSchema.safeParse(result?.role);
  if (!role.success) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    role = roleSchema.safeParse(profile?.role);
  }
  if (!role.success) return null;
  if (role.data === "student") await joinPendingCourse(supabase);
  return role.data;
}
