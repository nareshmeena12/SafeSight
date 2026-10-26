import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn } from "@/lib/auth/finish";
import { redirectAfterLogin } from "@/lib/auth/roles";
import { joinCodeSchema } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google / Microsoft sign-in comes back to (S25). Exchanges the code
 * for a session, applies staff invites and the email domain's institution
 * (`finishSignIn`), joins a class code typed on the sign-up page, then sends
 * the user home by role. New SSO accounts are students unless invited.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, origin));
    res.cookies.delete({ name: "ss_join_code", path: "/auth" });
    return res;
  };

  const providerError = searchParams.get("error");
  if (providerError) {
    const description = searchParams.get("error_description") ?? "";
    console.warn("SSO callback error:", providerError, description);
    if (providerError === "access_denied") return fail("sso-cancelled");
    if (/email/i.test(description)) return fail("sso-email");
    return fail("sso");
  }
  const code = searchParams.get("code");
  if (!code) return fail("sso");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("exchangeCodeForSession:", error.message);
    return fail("sso");
  }
  const role = await finishSignIn(supabase);
  if (!role) {
    await supabase.auth.signOut();
    return fail("sso");
  }

  let destination = redirectAfterLogin(role, searchParams.get("next"));
  const joinCode = joinCodeSchema.safeParse(request.cookies.get("ss_join_code")?.value ?? "");
  if (role === "student" && joinCode.success) {
    const joined = await supabase.rpc("join_course", { p_join_code: joinCode.data });
    // Wrong domain or an unknown code: the join page explains and lets them try again.
    if (joined.error || !joined.data) destination = `/student/join?code=${joinCode.data}`;
  }
  const res = NextResponse.redirect(new URL(destination, origin));
  res.cookies.delete({ name: "ss_join_code", path: "/auth" });
  return res;
}
