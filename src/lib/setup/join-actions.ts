"use server";

import { redirect } from "next/navigation";
import { joinCodeSchema } from "@/lib/auth/schemas";
import { requireRole } from "@/lib/auth/dal";
import { restrictedDomainsForCode } from "@/lib/auth/domain-rules";
import { domainRuleMessage } from "@/lib/auth/domains";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/teacher/schemas";

/** A signed-in student joins a course with its class code (the same `join_course` RPC as sign-up). */
export async function joinWithCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = joinCodeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s+/g, "").toUpperCase());
  if (!parsed.success) return { status: "error", fieldErrors: { code: "Class codes are 6 letters and numbers, like THRM01." } };
  await requireRole(["student"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_course", { p_join_code: parsed.data });
  if (error?.message.includes("email_domain_not_allowed")) {
    // S25: the class's institution only takes its own email domains.
    const domains = await restrictedDomainsForCode(parsed.data);
    return { status: "error", fieldErrors: { code: domainRuleMessage(domains ?? []) } };
  }
  if (error) return { status: "error", message: "That didn't work just now. Please try again." };
  if (!data) return { status: "error", fieldErrors: { code: "We couldn't find a course with that code. Check it with your teacher." } };
  redirect("/student");
}
