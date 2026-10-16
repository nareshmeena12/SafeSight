"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirectAfterLogin, roleSchema } from "./roles";
import {
  fieldErrorsFrom,
  loginSchema,
  signupSchema,
  type AuthFormState,
} from "./schemas";

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    const unconfirmed = error?.code === "email_not_confirmed";
    return {
      status: "error",
      email: parsed.data.email,
      message: unconfirmed
        ? "Please confirm your email first. The link is in your inbox."
        : "That email and password don't match. Please try again.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success) {
    await supabase.auth.signOut();
    return {
      status: "error",
      email: parsed.data.email,
      message:
        "We couldn't find your SafeSight profile. Please contact your teacher or admin.",
    };
  }

  redirect(redirectAfterLogin(role.data, parsed.data.next));
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { fullName, email, password, role } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user trigger; it only accepts student or teacher.
      data: { full_name: fullName, role },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    const exists = error.code === "user_already_exists";
    return {
      status: "error",
      email,
      message: exists
        ? "An account with this email already exists. Try logging in instead."
        : "We couldn't create your account just now. Please try again in a minute.",
    };
  }

  // With email confirmation on there is no session yet.
  if (!data.session) return { status: "check-email", email };

  redirect(redirectAfterLogin(role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// The request's own origin, so preview deploys confirm back to themselves.
// Supabase only follows redirect URLs on its allow list.
async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}
