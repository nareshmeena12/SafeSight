import type { Provider } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ssoProviders } from "@/lib/auth/sso";
import { ssoProviderSchema, supabaseProvider } from "@/lib/auth/sso-shared";
import { joinCodeSchema } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * "Continue with Google / Microsoft" (S25). Starts Supabase Auth's OAuth flow
 * (PKCE: the code verifier is kept in a cookie by the server client) and sends
 * the browser to the provider. The provider returns to /auth/callback.
 * A class code typed on the sign-up page rides along in a short-lived cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const provider = ssoProviderSchema.safeParse(searchParams.get("provider"));
  if (!provider.success) return NextResponse.redirect(new URL("/login?error=sso", origin));
  const enabled = await ssoProviders();
  if (!enabled[provider.data]) return NextResponse.redirect(new URL("/login?error=sso-off", origin));

  const callback = new URL("/auth/callback", origin);
  const next = searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && next.length <= 512) callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: supabaseProvider[provider.data] as Provider,
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // Microsoft only shares the email address with the `email` scope.
      scopes: provider.data === "microsoft" ? "openid email profile" : undefined,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth:", error?.message);
    return NextResponse.redirect(new URL("/login?error=sso", origin));
  }

  const response = NextResponse.redirect(data.url);
  const code = joinCodeSchema.safeParse(searchParams.get("code") ?? "");
  if (code.success) {
    response.cookies.set("ss_join_code", code.data, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 15 * 60,
      path: "/auth",
    });
  }
  return response;
}
