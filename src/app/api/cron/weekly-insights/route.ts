import { runWeeklyInsights } from "@/lib/digest/weekly";

export const maxDuration = 300;

/**
 * Monday morning (vercel.json cron, 07:00 India time): this week's pre-lecture
 * briefs, then each teacher's digest. Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; without the secret set, the route refuses every request.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    // Leave a minute for the digests after the last brief starts.
    const summary = await runWeeklyInsights({ deadline: Date.now() + (maxDuration - 90) * 1000 });
    console.log(JSON.stringify({ event: "weekly_insights", ...summary }));
    return Response.json(summary);
  } catch (error) {
    console.error("weekly insights failed", error);
    return Response.json({ error: "Weekly insights failed." }, { status: 500 });
  }
}
