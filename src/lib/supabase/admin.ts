import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses row-level security, so use it only in server
 * code that has already checked who is asking. Never import from the browser.
 */
export function createAdminClient() {
  const serviceRoleKey = z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is not set")
    .parse(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
