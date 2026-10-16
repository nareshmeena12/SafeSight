import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { joinPendingCourse } from "@/lib/auth/join";
import { redirectAfterLogin, roleSchema } from "@/lib/auth/roles";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success) return NextResponse.redirect(new URL("/login", origin));
  // A class code typed at sign-up is joined once the email is confirmed.
  if (role.data === "student") await joinPendingCourse(supabase);

  return NextResponse.redirect(
    new URL(redirectAfterLogin(role.data, searchParams.get("next")), origin),
  );
}
