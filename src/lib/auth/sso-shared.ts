import { z } from "zod";

/** Sign-in providers shown on /login and /signup. "microsoft" is Supabase's `azure` provider. */
export const ssoProviderSchema = z.enum(["google", "microsoft"]);
export type SsoProvider = z.infer<typeof ssoProviderSchema>;

export const supabaseProvider = { google: "google", microsoft: "azure" } as const satisfies Record<SsoProvider, string>;

export const ssoLabels: Record<SsoProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

/** The link a sign-in button follows (app/auth/sso). */
export function ssoHref(provider: SsoProvider, opts: { next?: string; joinCode?: string } = {}): string {
  const q = new URLSearchParams({ provider });
  if (opts.next) q.set("next", opts.next);
  if (opts.joinCode && /^[A-Z0-9]{6}$/.test(opts.joinCode.toUpperCase())) q.set("code", opts.joinCode.toUpperCase());
  return `/auth/sso?${q}`;
}

/** Friendly text for the `?error=` the SSO routes send back to /login. */
export const ssoErrors = {
  sso: "That sign-in didn't finish. Please try again, or use your email and password.",
  "sso-cancelled": "Sign-in was cancelled. Choose a way to continue.",
  "sso-email": "Your account didn't share an email address with us, so we couldn't sign you in. Please use another way.",
  "sso-off": "That sign-in option isn't set up yet. Please use your email and password.",
} as const;
