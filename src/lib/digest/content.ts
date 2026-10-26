import { relianceBand } from "@/lib/reliance";

/**
 * The Monday digest for a teacher (S19): per course, this week's brief, flags
 * and the Reliance Score trend. Pure: the content type and how it reads as an
 * email (plain text and simple HTML). Numbers only; never a chat or a name.
 */

export type DigestCourse = {
  id: string;
  name: string;
  code: string;
  enrolled: number;
  /** Top misconceptions from this week's brief, or null when there is none. */
  brief: { misconceptions: { title: string; students: number }[]; quizReady: boolean } | null;
  flags: { open: number; high: number; newThisWeek: number };
  /** Average Reliance Score of the last 4 full weeks, oldest first (null = no data). */
  reliance: { weeks: { week: string; avg: number | null }[]; highBand: number };
};

export type DigestContent = {
  week: string;
  generatedAt: string;
  courses: DigestCourse[];
};

const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const label = (week: string) => shortDate.format(new Date(`${week}T00:00:00+05:30`));
const courseName = (c: Pick<DigestCourse, "name" | "code">) => (c.code ? `${c.code} · ${c.name}` : c.name);

/** "Up 6 from 42 to 48", "Steady at 35", "No numbers yet". */
export function relianceTrendLine(weeks: { avg: number | null }[]) {
  const known = weeks.filter((w) => w.avg !== null) as { avg: number }[];
  if (known.length === 0) return "No Reliance Score yet";
  const last = Math.round(known[known.length - 1].avg);
  const band = { low: "low", medium: "medium", high: "high" }[relianceBand(last)];
  if (known.length === 1) return `Average Reliance Score ${last} (${band} band)`;
  const prev = Math.round(known[known.length - 2].avg);
  const diff = last - prev;
  if (Math.abs(diff) < 2) return `Average Reliance Score steady at ${last} (${band} band)`;
  return `Average Reliance Score ${diff > 0 ? "up" : "down"} ${Math.abs(diff)}, from ${prev} to ${last} (${band} band)`;
}

export function digestSubject(content: DigestContent) {
  const open = content.courses.reduce((s, c) => s + c.flags.open, 0);
  return `SafeSight · your week ahead (${label(content.week)})${open ? ` · ${open} open ${open === 1 ? "flag" : "flags"}` : ""}`;
}

function flagLine(f: DigestCourse["flags"]) {
  if (f.open === 0 && f.newThisWeek === 0) return "No open flags";
  const parts = [`${f.open} open ${f.open === 1 ? "flag" : "flags"}`];
  if (f.high) parts.push(`${f.high} high priority`);
  parts.push(`${f.newThisWeek} new in the last 7 days`);
  return parts.join(", ");
}

export function digestText(content: DigestContent, siteUrl: string) {
  const base = siteUrl.replace(/\/$/, "");
  const lines = [`Your week ahead — week of ${label(content.week)}`, ""];
  if (content.courses.length === 0) lines.push("You have no courses yet.");
  for (const c of content.courses) {
    lines.push(courseName(c), "-".repeat(Math.min(60, courseName(c).length)));
    if (c.brief && c.brief.misconceptions.length) {
      lines.push("Before your next class:");
      for (const m of c.brief.misconceptions) lines.push(`  • ${m.title} — ${m.students} of ${c.enrolled} students`);
      lines.push(`  Brief${c.brief.quizReady ? " and 5-question quiz" : ""}: ${base}/teacher/brief?course=${c.id}`);
    } else {
      lines.push("Before your next class: not enough questions to Sage this week to spot patterns.");
    }
    lines.push(`Flags: ${flagLine(c.flags)}`);
    lines.push(`${relianceTrendLine(c.reliance.weeks)}${c.reliance.highBand ? `; ${c.reliance.highBand} in the high band` : ""}`);
    lines.push("");
  }
  lines.push(`Open your overview: ${base}/teacher`);
  lines.push(`Change email settings: ${base}/teacher/brief/digest`);
  return lines.join("\n");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Simple, table-free HTML with inline styles (email clients ignore stylesheets). Light theme only. */
export function digestHtml(content: DigestContent, siteUrl: string) {
  const base = esc(siteUrl.replace(/\/$/, ""));
  const text = "#14161F";
  const muted = "#6B6F7B";
  const primary = "#1F6F5C";
  const border = "#E7E3DA";
  const p = (s: string, style = "") => `<p style="margin:0 0 8px;${style}">${s}</p>`;
  const courses = content.courses.map((c) => {
    const brief =
      c.brief && c.brief.misconceptions.length
        ? `${p("<strong>Before your next class</strong>")}<ul style="margin:0 0 8px;padding-left:20px">${c.brief.misconceptions
            .map((m) => `<li style="margin:0 0 4px">${esc(m.title)} <span style="color:${muted}">— ${m.students} of ${c.enrolled} students</span></li>`)
            .join("")}</ul>${p(`<a href="${base}/teacher/brief?course=${esc(c.id)}" style="color:${primary}">Open the brief${c.brief.quizReady ? " and quiz" : ""}</a>`)}`
        : p("Before your next class: not enough questions to Sage this week to spot patterns.", `color:${muted}`);
    return `<div style="border:1px solid ${border};border-radius:16px;padding:16px 20px;margin:0 0 16px;background:#FFFFFF">
<h2 style="font-size:18px;margin:0 0 12px;font-weight:600">${esc(courseName(c))}</h2>
${brief}
${p(`<strong>Flags:</strong> ${esc(flagLine(c.flags))}`)}
${p(`${esc(relianceTrendLine(c.reliance.weeks))}${c.reliance.highBand ? `; ${c.reliance.highBand} in the high band` : ""}`, "margin:0")}
</div>`;
  });
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FAF8F3;color:${text};font-family:Geist,Inter,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:600px;margin:0 auto">
<p style="margin:0 0 4px;color:${muted};font-size:13px;letter-spacing:.06em;text-transform:uppercase">SafeSight</p>
<h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:32px;line-height:1.2;margin:0 0 24px">Your week ahead</h1>
${courses.join("\n") || p("You have no courses yet.")}
${p(`<a href="${base}/teacher" style="color:${primary}">Open your overview</a>`)}
<p style="margin:24px 0 0;color:${muted};font-size:13px">Week of ${esc(label(content.week))}. Summaries only — no student chats. <a href="${base}/teacher/brief/digest" style="color:${muted}">Email settings</a></p>
</div></body></html>`;
}
