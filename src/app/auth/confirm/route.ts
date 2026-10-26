import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn } from "@/lib/auth/finish";
import { redirectAfterLogin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for links in Supabase emails (sign-up confirmation, magic
 * link). Exchanges the token for a session, joins a pending class code, then
 * sends the user home by role.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  if (error) return NextResponse.redirect(new URL("/login?error=confirm", origin));

  // Staff invites and the email domain's institution (S25) apply once the
  // email is confirmed; a class code typed at sign-up is joined too.
  const role = await finishSignIn(supabase);
  if (!role) return NextResponse.redirect(new URL("/login", origin));

  return NextResponse.redirect(
    new URL(redirectAfterLogin(role, searchParams.get("next")), origin),
  );
}
