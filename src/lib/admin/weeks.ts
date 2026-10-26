/**
 * India-time weeks (Monday first), the same weeks the SQL functions use.
 * Pure: `now` is passed in for tests.
 */

const IST_MS = 5.5 * 60 * 60 * 1000;

/** The Mondays of the last `count` weeks (YYYY-MM-DD, oldest first), this week last. */
export function recentWeeks(count: number, now = new Date()): string[] {
  const ist = new Date(now.getTime() + IST_MS);
  const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) =>
    new Date(monday - (count - 1 - i) * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-26" → "26 Oct". */
export function formatWeekLabel(week: string): string {
  const [, m, d] = week.split("-").map(Number);
  return `${d} ${months[(m ?? 1) - 1]}`;
}
