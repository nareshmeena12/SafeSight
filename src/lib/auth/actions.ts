"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirectAfterLogin, roleSchema } from "./roles";
import { claimTeacherInvites, joinPendingCourse } from "./join";
import {
  fieldErrorsFrom,
  loginSchema,
  magicLinkSchema,
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

  // An admin invited this email as a teacher (S23).
  const current = await claimTeacherInvites(supabase, role.data);
  // Courses whose teacher invited this email from a class list (S22).
  if (current === "student") await joinPendingCourse(supabase);
  redirect(redirectAfterLogin(current, parsed.data.next));
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { fullName, email, password, role, institution, joinCode } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // full_name and role are read by the handle_new_user trigger (it only
      // accepts student or teacher). institution_name and join_code are kept
      // in metadata: see lib/auth/join.ts.
      data: {
        full_name: fullName,
        role,
        ...(institution ? { institution_name: institution } : {}),
        ...(joinCode ? { join_code: joinCode } : {}),
      },
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

  // With email confirmation on there is no session yet; the class code is
  // joined when the link is opened (app/auth/confirm).
  if (!data.session) return { status: "check-email", email };

  const current = await claimTeacherInvites(supabase, role);
  await joinPendingCourse(supabase);
  redirect(redirectAfterLogin(current));
}

/** "Email me a sign-in link" and "Forgot password?" on the log-in page. */
export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { email, next } = parsed.data;

  const supabase = await createClient();
  const redirectTo = new URL("/auth/confirm", await siteUrl());
  if (next) redirectTo.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo.toString() },
  });

  // Only rate limits are reported. Any other error (such as an unknown
  // address) shows the same "check your inbox" screen, so the form doesn't
  // reveal who has an account.
  if (error?.status === 429) {
    return {
      status: "error",
      email,
      message: "We've just sent you a link. Please wait a minute before asking for another.",
    };
  }
  return { status: "link-sent", email };
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
