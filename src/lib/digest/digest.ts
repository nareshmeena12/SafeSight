import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestBriefs } from "@/lib/brief/brief";
import { relianceThresholds } from "@/lib/reliance";
import type { Database } from "@/lib/supabase/database.types";
import { weeksAgo, weekStart } from "@/lib/teacher/dates";
import type { DigestContent, DigestCourse } from "./content";

type Db = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The digest for one teacher. Works with the teacher's own client (in-app,
 * RLS) or the service role (the Monday job): it only ever reads that
 * teacher's courses, and only counts and averages.
 */
export async function buildDigest(db: Db, teacherId: string, now = new Date()): Promise<DigestContent> {
  const { data: courses, error } = await db
    .from("courses")
    .select("id, name, code, enrollments(count)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`courses: ${error.message}`);
  const ids = courses.map((c) => c.id);
  const week = weekStart(now);
  // The last four full weeks (the current one has only just started on Monday).
  const weeks = [4, 3, 2, 1].map((n) => weeksAgo(now, n));

  const [briefs, flags, metrics] = await Promise.all([
    latestBriefs(db, ids),
    ids.length
      ? db.from("flags").select("course_id, status, severity, created_at").in("course_id", ids).or(`status.eq.open,created_at.gte.${new Date(now.getTime() - 7 * DAY_MS).toISOString()}`).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from("weekly_metrics").select("course_id, student_id, week, reliance_score").in("course_id", ids).gte("week", weeks[0]).lte("week", weeks[3]).limit(20_000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (flags.error) throw new Error(`flags: ${flags.error.message}`);
  if (metrics.error) throw new Error(`weekly_metrics: ${metrics.error.message}`);
  const since = now.getTime() - 7 * DAY_MS;

  const list: DigestCourse[] = courses.map((c) => {
    const brief = briefs.get(c.id);
    // Only this week's or last week's brief counts as "before your next class".
    const fresh = brief && brief.week >= weeksAgo(now, 1) ? brief : null;
    const courseFlags = flags.data.filter((f) => f.course_id === c.id);
    const courseMetrics = metrics.data.filter((m) => m.course_id === c.id);
    const lastWeek = courseMetrics.filter((m) => m.week === weeks[3]);
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      enrolled: c.enrollments[0]?.count ?? 0,
      brief: fresh
        ? {
            misconceptions: fresh.misconceptions.map((m) => ({ title: m.title, students: m.students })),
            quizReady: fresh.quiz.length > 0,
          }
        : null,
      flags: {
        open: courseFlags.filter((f) => f.status === "open").length,
        high: courseFlags.filter((f) => f.status === "open" && f.severity === "high").length,
        newThisWeek: courseFlags.filter((f) => new Date(f.created_at).getTime() >= since).length,
      },
      reliance: {
        weeks: weeks.map((w) => {
          const rows = courseMetrics.filter((m) => m.week === w);
          return { week: w, avg: rows.length ? Math.round((rows.reduce((s, r) => s + r.reliance_score, 0) / rows.length) * 10) / 10 : null };
        }),
        highBand: new Set(lastWeek.filter((m) => m.reliance_score >= relianceThresholds.high).map((m) => m.student_id)).size,
      },
    };
  });

  return { week, generatedAt: now.toISOString(), courses: list };
}

/** The teacher's email choice (default: yes). */
export async function weeklyEmailWanted(db: Db, teacherId: string) {
  const { data } = await db.from("teacher_digest_prefs").select("weekly_email").eq("teacher_id", teacherId).maybeSingle();
  return data?.weekly_email ?? true;
}

/** The latest digest the Monday job recorded for this teacher (RLS: their own). */
export async function lastDigest(db: Db, teacherId: string) {
  const { data } = await db
    .from("teacher_digests")
    .select("week, email_status, emailed_at, created_at")
    .eq("teacher_id", teacherId)
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
