import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly recompute of weekly_metrics for every course (vercel.json cron).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret set,
 * the route refuses every request.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("refresh_weekly_metrics", { p_weeks: 2 });
  if (error) {
    console.error("weekly metrics refresh failed", error);
    return Response.json({ error: "Refresh failed." }, { status: 500 });
  }
  return Response.json({ rows: data });
}
