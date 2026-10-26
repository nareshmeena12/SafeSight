import { purgeExpiredPhotos } from "@/lib/photos/data";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly recompute of weekly_metrics for every course (vercel.json cron).
 * Also (S21) removes photos of working older than 30 days (unsent ones after
 * a day): Hobby allows two crons and both are in use, so it rides along here.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret set,
 * the route refuses every request.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  const [refresh, photos] = await Promise.all([
    createAdminClient().rpc("refresh_weekly_metrics", { p_weeks: 2 }),
    purgeExpiredPhotos().catch((e) => {
      console.error("photo clean-up failed", e);
      return null;
    }),
  ]);
  if (refresh.error) {
    console.error("weekly metrics refresh failed", refresh.error);
    return Response.json({ error: "Refresh failed.", photosRemoved: photos }, { status: 500 });
  }
  return Response.json({ rows: refresh.data, photosRemoved: photos });
}
