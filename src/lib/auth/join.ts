import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { joinCodeSchema } from "./schemas";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Joins the course whose class code a student typed at sign-up (kept in user
 * metadata as `join_code`), then clears it. Runs right after sign-up when a
 * session exists, or when the confirmation link is opened. Never throws: a
 * wrong or expired code just means the student adds it later.
 */
export async function joinPendingCourse(supabase: ServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const code = joinCodeSchema.safeParse(user?.user_metadata?.join_code);
  if (!user || !code.success) return;

  const { error } = await supabase.rpc("join_course", { p_join_code: code.data });
  if (error) console.warn("join_course after sign-up failed:", error.message);
  await supabase.auth.updateUser({ data: { join_code: null } });
}
