import "server-only";
import { publicEnv } from "@/lib/env";
import type { SsoProvider } from "./sso-shared";

/**
 * Google and Microsoft sign-in (S25) run through Supabase Auth. Which ones
 * are switched on lives in the Supabase dashboard, so the buttons follow
 * Supabase's own settings (`/auth/v1/settings`): a provider appears once it
 * is enabled there, and stays hidden (no broken button) until then.
 * `AUTH_SSO_PROVIDERS` ("google,microsoft", or "none") overrides the check.
 */

export type SsoStatus = Record<SsoProvider, boolean>;

const TTL_MS = 5 * 60_000;
let cached: { at: number; value: SsoStatus } | null = null;

function fromEnv(): SsoStatus | null {
  const raw = process.env.AUTH_SSO_PROVIDERS?.trim().toLowerCase();
  if (!raw) return null;
  const list = raw.split(/[\s,]+/);
  return { google: list.includes("google"), microsoft: list.includes("microsoft") || list.includes("azure") };
}

export async function ssoProviders(): Promise<SsoStatus> {
  const forced = fromEnv();
  if (forced) return forced;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const off: SsoStatus = { google: false, microsoft: false };
  try {
    const env = publicEnv();
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return off;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    const value = { google: Boolean(body.external?.google), microsoft: Boolean(body.external?.azure) };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Unreachable settings never block the password form.
    return off;
  }
}
