/**
 * Recomputes weekly_metrics (and the Reliance Score) for every course.
 *
 *   pnpm metrics            last 8 weeks
 *   pnpm metrics --weeks 12
 *
 * Run after `pnpm seed` or after adding demo activity (S11). Reads
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (real env first,
 * then .env.local / .env).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const flag = process.argv.indexOf("--weeks");
const weeks = flag > -1 ? Number(process.argv[flag + 1]) : 8;
if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
  console.error("--weeks must be a whole number from 1 to 52.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.rpc("refresh_weekly_metrics", { p_weeks: weeks });
if (error) {
  console.error(`Refresh failed: ${error.message}`);
  process.exit(1);
}
console.log(`weekly_metrics: ${data} rows for the last ${weeks} weeks.`);
