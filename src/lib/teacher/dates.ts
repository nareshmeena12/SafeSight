/**
 * Date helpers for the teacher dashboard. Weeks start on Monday in India time,
 * matching `refresh_weekly_metrics()` in the database.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the week containing `date`, in India time, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - dow * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** The Monday `n` weeks before the week containing `date`. */
export function weeksAgo(date: Date, n: number): string {
  const monday = new Date(`${weekStart(date)}T00:00:00Z`);
  return new Date(monday.getTime() - n * 7 * DAY_MS).toISOString().slice(0, 10);
}

/** `days` days before `now`, as an ISO timestamp. */
export function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

const short = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const withTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** "12 Oct" for a week label or a date. */
export function formatShortDate(value: string | Date): string {
  return short.format(typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value) : value);
}

/** "12 Oct, 2:30 pm" */
export function formatDateTime(value: string | Date): string {
  return withTime.format(typeof value === "string" ? new Date(value) : value);
}

/** "3 days ago", "just now" — for last-active columns. */
export function formatRelative(value: string | null, now: Date = new Date()): string {
  if (!value) return "Not yet";
  const diff = now.getTime() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return days === 1 ? "Yesterday" : `${days} days ago`;
  return formatShortDate(value);
}
