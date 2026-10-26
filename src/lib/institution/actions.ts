"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/dal";
import { domainSchema, emailAllowed } from "@/lib/auth/domains";
import { ssoProviders } from "@/lib/auth/sso";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/setup/invites";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "@/lib/teacher/schemas";
import { adminInstitutionId } from "./server";
import { staffInviteHtml, staffInviteSubject, staffInviteText } from "./staff-email";

/**
 * Admin actions for sign-in settings (S25): the institution's email domains,
 * the "only these domains" switch and staff invites. Each checks the admin
 * role and their institution, then writes with the service role (these
 * tables have no write policies).
 */

const tryAgain = "That didn't save. Please try again in a moment.";
const INVITES_PER_HOUR = 100;

async function adminContext() {
  const user = await requireRole(["admin"]);
  const institutionId = await adminInstitutionId(user);
  return institutionId ? { user, institutionId, admin: createAdminClient() } : null;
}

export async function addDomain(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = domainSchema.safeParse(formData.get("domain") ?? "");
  if (!parsed.success) return { status: "error", fieldErrors: { domain: parsed.error.issues[0]?.message } };
  const ctx = await adminContext();
  if (!ctx) return { status: "error", message: "Your account isn't linked to an institution yet." };
  const { data: existing } = await ctx.admin.from("institution_email_domains").select("institution_id").eq("domain", parsed.data).maybeSingle();
  if (existing) {
    return {
      status: "error",
      fieldErrors: {
        domain: existing.institution_id === ctx.institutionId ? "That domain is already on your list." : "That domain belongs to another institution on SafeSight. Write to us if it's yours.",
      },
    };
  }
  const { count } = await ctx.admin.from("institution_email_domains").select("domain", { count: "exact", head: true }).eq("institution_id", ctx.institutionId);
  if ((count ?? 0) >= 20) return { status: "error", message: "An institution can have up to 20 domains." };
  const { error } = await ctx.admin
    .from("institution_email_domains")
    .insert({ domain: parsed.data, institution_id: ctx.institutionId, created_by: ctx.user.id });
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return { status: "success", message: `${parsed.data} added.` };
}

export async function removeDomain(formData: FormData): Promise<void> {
  const domain = z.string().min(1).max(253).safeParse(formData.get("domain"));
  if (!domain.success) return;
  const ctx = await adminContext();
  if (!ctx) return;
  await ctx.admin.from("institution_email_domains").delete().eq("domain", domain.data).eq("institution_id", ctx.institutionId);
  // With no domains left, "only these domains" would shut everyone out.
  const { count } = await ctx.admin.from("institution_email_domains").select("domain", { count: "exact", head: true }).eq("institution_id", ctx.institutionId);
  if (!count) await ctx.admin.from("institutions").update({ sign_up_domains_only: false }).eq("id", ctx.institutionId);
  refresh();
}

export async function setDomainsOnly(_prev: FormState, formData: FormData): Promise<FormState> {
  const on = formData.get("domainsOnly") === "on";
  const ctx = await adminContext();
  if (!ctx) return { status: "error", message: "Your account isn't linked to an institution yet." };
  if (on) {
    const { count } = await ctx.admin.from("institution_email_domains").select("domain", { count: "exact", head: true }).eq("institution_id", ctx.institutionId);
    if (!count) return { status: "error", message: "Add your college's email domain first." };
  }
  const { error } = await ctx.admin.from("institutions").update({ sign_up_domains_only: on }).eq("id", ctx.institutionId);
  if (error) return { status: "error", message: tryAgain };
  refresh();
  return { status: "success", message: on ? "Only your domains can join your courses now." : "Anyone with a class code can join your courses." };
}

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Type their email address.")
    .pipe(z.email("That email looks incomplete, like name@college.edu.in.")),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["teacher", "admin"]),
});

export async function inviteStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", fieldErrors: { [String(issue?.path[0] ?? "email")]: issue?.message } };
  }
  const ctx = await adminContext();
  if (!ctx) return { status: "error", message: "Your account isn't linked to an institution yet." };
  const { email, name, role } = parsed.data;

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const [{ data: inst }, { data: domains }, { count }, { data: accounts }] = await Promise.all([
    ctx.admin.from("institutions").select("name, sign_up_domains_only").eq("id", ctx.institutionId).single(),
    ctx.admin.from("institution_email_domains").select("domain").eq("institution_id", ctx.institutionId),
    ctx.admin.from("staff_invites").select("id", { count: "exact", head: true }).eq("invited_by", ctx.user.id).gte("created_at", since),
    ctx.admin.rpc("profiles_by_email", { p_emails: [email] }),
  ]);
  if (!inst) return { status: "error", message: tryAgain };
  if ((count ?? 0) >= INVITES_PER_HOUR) return { status: "error", message: "That's a lot of invites in one hour. Please send the rest a little later." };
  if (!emailAllowed(email, { domainsOnly: inst.sign_up_domains_only, domains: (domains ?? []).map((d) => d.domain) })) {
    return { status: "error", fieldErrors: { email: "Your institution only takes its own email domains. Use their college email." } };
  }
  const account = accounts?.[0];
  if (account && (account.role === "admin" || account.role === role)) {
    const { data: profile } = await ctx.admin.from("profiles").select("institution_id").eq("id", account.id).maybeSingle();
    if (profile?.institution_id === ctx.institutionId) {
      return { status: "error", fieldErrors: { email: `${email} is already ${account.role === "admin" ? "an admin" : "a teacher"} here.` } };
    }
  }

  const configured = emailConfigured();
  const { data: invite, error } = await ctx.admin
    .from("staff_invites")
    .insert({
      institution_id: ctx.institutionId,
      email,
      full_name: name ?? "",
      role,
      invited_by: ctx.user.id,
      email_status: configured ? "queued" : "not_configured",
    })
    .select("id")
    .single();
  if (error) {
    // One pending invite per email (unique index).
    if (error.code === "23505") return { status: "error", fieldErrors: { email: "That email already has an invite waiting." } };
    return { status: "error", message: tryAgain };
  }
  if (configured) queueStaffEmail(invite.id);
  refresh();
  return {
    status: "success",
    message: account
      ? `Invite saved. ${email} already has an account; their ${role} access is added the next time they log in.`
      : configured
        ? `Invite sent to ${email}.`
        : `Invite saved. Email isn't set up, so tell ${email} to sign up or sign in with that address.`,
  };
}

const idSchema = z.object({ inviteId: z.uuid() });

export async function revokeStaffInvite(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ctx = await adminContext();
  if (!ctx) return;
  await ctx.admin
    .from("staff_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.inviteId)
    .eq("institution_id", ctx.institutionId)
    .eq("status", "pending");
  refresh();
}

export async function resendStaffInvite(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !emailConfigured()) return;
  const ctx = await adminContext();
  if (!ctx) return;
  const { data } = await ctx.admin
    .from("staff_invites")
    .update({ email_status: "queued", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.inviteId)
    .eq("institution_id", ctx.institutionId)
    .eq("status", "pending")
    .select("id");
  if (data?.length) queueStaffEmail(parsed.data.inviteId);
  refresh();
}

function queueStaffEmail(inviteId: string) {
  const job = sendStaffEmail(inviteId).catch((e) => console.error("staff invite email:", e));
  after(() => job);
}

async function sendStaffEmail(inviteId: string) {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("staff_invites")
    .select("id, email, full_name, role, institution:institutions(name), inviter:profiles!staff_invites_invited_by_fkey(full_name)")
    .eq("id", inviteId)
    .single();
  if (!invite) return;
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const input = {
    name: invite.full_name,
    email: invite.email,
    role: invite.role === "admin" ? ("admin" as const) : ("teacher" as const),
    institutionName: one(invite.institution)?.name ?? "your college",
    invitedBy: one(invite.inviter)?.full_name ?? "",
    siteUrl: siteUrl(),
    sso: await ssoProviders(),
  };
  const result = await sendEmail({ to: invite.email, subject: staffInviteSubject(input), text: staffInviteText(input), html: staffInviteHtml(input) });
  await admin
    .from("staff_invites")
    .update({ email_status: result.ok ? "sent" : "failed", updated_at: new Date().toISOString() })
    .eq("id", inviteId);
}
