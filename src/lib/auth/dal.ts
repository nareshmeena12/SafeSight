import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, roleSchema, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
};

/**
 * The signed-in user with their role, or null. Verifies the session with
 * Supabase Auth, then reads the profile under row-level security.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = roleSchema.safeParse(profile?.role);
  if (!role.success) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: role.data,
    fullName: profile?.full_name ?? "",
  };
}

/**
 * Use at the top of every protected page. Sends signed-out visitors to /login
 * and users with the wrong role to their own home.
 */
export async function requireRole(allowed: readonly Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowed.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}
