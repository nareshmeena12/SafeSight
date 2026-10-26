import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/teacher/queries";

export type StaffInviteRow = {
  id: string;
  email: string;
  name: string;
  role: "teacher" | "admin";
  status: "pending" | "accepted" | "revoked";
  emailStatus: "queued" | "sent" | "failed" | "not_configured";
  createdAt: string;
  acceptedAt: string | null;
};

export type InstitutionSettings = {
  id: string;
  name: string;
  domainsOnly: boolean;
  domains: string[];
  invites: StaffInviteRow[];
};

/** The admin's own institution (null when their account isn't linked to one). */
export async function adminInstitutionId(user: CurrentUser): Promise<string | null> {
  if (user.role !== "admin") return null;
  const { data } = await createAdminClient().from("profiles").select("institution_id").eq("id", user.id).maybeSingle();
  return data?.institution_id ?? null;
}

/** Sign-in settings for the admin page. Domains and invites are read under RLS. */
export async function institutionSettings(db: Db, institutionId: string): Promise<InstitutionSettings | null> {
  const [inst, domains, invites] = await Promise.all([
    db.from("institutions").select("id, name, sign_up_domains_only").eq("id", institutionId).maybeSingle(),
    db.from("institution_email_domains").select("domain").eq("institution_id", institutionId).order("domain"),
    db
      .from("staff_invites")
      .select("id, email, full_name, role, status, email_status, created_at, accepted_at")
      .eq("institution_id", institutionId)
      .neq("status", "revoked")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (!inst.data) return null;
  return {
    id: inst.data.id,
    name: inst.data.name,
    domainsOnly: inst.data.sign_up_domains_only,
    domains: (domains.data ?? []).map((d) => d.domain),
    invites: (invites.data ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      name: i.full_name,
      role: i.role === "admin" ? "admin" : "teacher",
      status: i.status === "accepted" ? "accepted" : i.status === "revoked" ? "revoked" : "pending",
      emailStatus: (["queued", "sent", "failed", "not_configured"] as const).find((s) => s === i.email_status) ?? "not_configured",
      createdAt: i.created_at,
      acceptedAt: i.accepted_at,
    })),
  };
}
