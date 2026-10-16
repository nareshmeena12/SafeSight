import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recomputes this week's weekly_metrics (and Reliance Scores) for one course,
 * so the dashboard reflects a new chat or submission within seconds instead
 * of after the nightly cron. Run it from after(); it never throws.
 */
export async function refreshCurrentWeek(courseId: string) {
  const { error } = await createAdminClient().rpc("refresh_weekly_metrics", { p_course_id: courseId, p_weeks: 1 });
  if (error) console.error("refresh weekly metrics:", error.message);
}

/** Same, for the course a Trace submission belongs to. */
export async function refreshCurrentWeekForSubmission(submissionId: string) {
  const { data } = await createAdminClient()
    .from("submissions")
    .select("assignments!inner(course_id)")
    .eq("id", submissionId)
    .maybeSingle();
  if (data) await refreshCurrentWeek(data.assignments.course_id);
}
