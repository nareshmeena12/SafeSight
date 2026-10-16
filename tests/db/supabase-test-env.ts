import { execFileSync } from "node:child_process";

export type TestEnv = { url: string; anonKey: string; serviceRoleKey: string };

/**
 * Credentials for database tests. These tests create and delete users, so
 * they only run against a local Supabase (`pnpm db:start`), never the hosted
 * project. Override with SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY /
 * SUPABASE_TEST_SERVICE_ROLE_KEY. Returns null when no local stack is up, so
 * the suite is skipped instead of failing.
 */
export function supabaseTestEnv(): TestEnv | null {
  const { SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_TEST_URL && SUPABASE_TEST_ANON_KEY && SUPABASE_TEST_SERVICE_ROLE_KEY) {
    return {
      url: SUPABASE_TEST_URL,
      anonKey: SUPABASE_TEST_ANON_KEY,
      serviceRoleKey: SUPABASE_TEST_SERVICE_ROLE_KEY,
    };
  }
  try {
    const out = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    });
    const status = JSON.parse(out.slice(out.indexOf("{")));
    if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) return null;
    return { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
  } catch {
    return null;
  }
}
