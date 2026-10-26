import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { domainRuleMessage, emailAllowed } from "./domains";

/**
 * The institution's email-domain rule for a class code (S25), read with the
 * service role so a visitor can't use it to test codes: returns the message
 * to show when `email` may not join that class, otherwise null (unknown
 * codes included; `join_course` enforces the same rule in the database).
 */
export async function domainRuleForCode(joinCode: string, email: string): Promise<string | null> {
  const domains = await restrictedDomainsForCode(joinCode);
  if (!domains) return null;
  return emailAllowed(email, { domainsOnly: true, domains }) ? null : domainRuleMessage(domains);
}

/** The allowed domains when the class's institution takes only its own; null when it doesn't restrict. */
export async function restrictedDomainsForCode(joinCode: string): Promise<string[] | null> {
  try {
    const admin = createAdminClient();
    const { data: course } = await admin
      .from("courses")
      .select("institution_id, teacher:profiles!courses_teacher_id_fkey(institution_id)")
      .eq("join_code", joinCode.trim().toUpperCase())
      .maybeSingle();
    if (!course) return null;
    const teacher = Array.isArray(course.teacher) ? course.teacher[0] : course.teacher;
    const institutionId = course.institution_id ?? teacher?.institution_id ?? null;
    if (!institutionId) return null;
    const [{ data: inst }, { data: domains }] = await Promise.all([
      admin.from("institutions").select("sign_up_domains_only").eq("id", institutionId).maybeSingle(),
      admin.from("institution_email_domains").select("domain").eq("institution_id", institutionId).order("domain"),
    ]);
    if (!inst?.sign_up_domains_only) return null;
    return (domains ?? []).map((d) => d.domain);
  } catch (e) {
    console.warn("domain rule check:", e instanceof Error ? e.message : e);
    return null;
  }
}
