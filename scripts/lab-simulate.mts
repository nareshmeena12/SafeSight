/**
 * Simulates a lab of SafeSight Lab extensions (S15), so the Live Lab demo can
 * be rehearsed without a real lab. Each seat joins and sends heartbeats and
 * events through the same HTTP API the extension uses (/api/lab/join and
 * /api/lab/heartbeat), so the teacher's grid updates live.
 *
 *   pnpm lab:simulate --create                 new 20-minute session for ME201, 30 seats
 *   pnpm lab:simulate --code 123456            join an existing session
 *   pnpm lab:simulate --create --minutes 10 --seats 12 --url https://…
 *
 * Options
 *   --url <origin>     the running SafeSight site (default NEXT_PUBLIC_SITE_URL or http://localhost:3000)
 *   --code <6 digits>  join this session
 *   --create           create a session first (service role) for the demo course (join code THRM01, or --course <id>)
 *   --minutes <n>      how long to simulate (and, with --create, the session length; default 20)
 *   --seats <n>        number of seats (default 30)
 *   --speed <n>        run the scripted moments n times sooner (default 1; heartbeats stay every 10 s)
 *
 * With --create the demo students get roll numbers ME23B001… if they have
 * none, so seats show real (invented) names. What the seats do:
 *   seat 14 tries ChatGPT twice and Gemini once (amber)
 *   seat 7 goes quiet for 45 s, then comes back (amber, "no signal for 45 s")
 *   seat 22 goes quiet after 3 minutes and never returns (red)
 *   seat 9 moves to another app for 90 s; seat 3 is idle for 2 minutes
 *   seat 18 finishes early; seat 25 joins again as if the browser restarted
 *   everyone else switches tabs, copies and pastes now and then
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for --create
 * (real env first, then .env.local / .env).
 */
import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const baseUrl = (arg("url") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const minutes = Number(arg("minutes") ?? 20);
const seatCount = Number(arg("seats") ?? 30);
const speed = Number(arg("speed") ?? 1);
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) fail("--minutes must be 1 to 180.");
if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 200) fail("--seats must be 1 to 200.");
if (!Number.isFinite(speed) || speed < 1 || speed > 60) fail("--speed must be 1 to 60.");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const pad = (n: number) => String(n).padStart(3, "0");
const rollFor = (i: number) => `ME23B${pad(i)}`;

// ---------------------------------------------------------------- setup

let code = arg("code");
if (has("create")) code = await createSession();
if (!code || !/^\d{6}$/.test(code)) fail("Pass --code <6 digits> or --create.");

async function createSession(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("--create needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const courseQuery = db.from("courses").select("id, name, teacher_id");
  const { data: course, error } = await (arg("course")
    ? courseQuery.eq("id", arg("course")!)
    : courseQuery.eq("join_code", "THRM01")
  ).maybeSingle();
  if (error || !course) fail("Couldn't find the demo course (join code THRM01). Run `pnpm seed`, or pass --course <id>.");

  // Give the course's students roll numbers so seats link to names.
  const { data: roster } = await db
    .from("enrollments")
    .select("student_id, profiles(full_name, roll_number)")
    .eq("course_id", course.id)
    .order("student_id");
  const students = (roster ?? [])
    .map((r) => ({ id: r.student_id, ...(r.profiles as unknown as { full_name: string; roll_number: string | null }) }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  let linked = 0;
  for (const [i, s] of students.slice(0, seatCount).entries()) {
    if (s.roll_number) continue;
    const { error: e } = await db.from("profiles").update({ roll_number: rollFor(i + 1) }).eq("id", s.id);
    if (!e) linked += 1;
  }
  if (linked) console.log(`Gave ${linked} demo students a roll number (ME23B001…).`);

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const sessionCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error: e } = await db.from("lab_sessions").insert({
      course_id: course.id,
      created_by: course.teacher_id,
      title: "Lab exam rehearsal",
      room: "CAD Lab 2",
      code: sessionCode,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + minutes * 60_000).toISOString(),
      blocklist: ["stackoverflow.com"],
    });
    if (!e) {
      console.log(`Created "Lab exam rehearsal" for ${course.name}. Code ${sessionCode}, ends in ${minutes} min.`);
      return sessionCode;
    }
    if (e.code !== "23505") fail(`Couldn't create the session: ${e.message}`);
  }
  fail("Couldn't find a free session code. Try again.");
}

// ---------------------------------------------------------------- seats

type Event = { type: string; detail?: Record<string, number | string>; at: number };
type Plan = { at: number; run: (seat: Seat) => void | Promise<void> }[];

const studyHosts = ["docs.python.org", "en.cppreference.com", "developer.mozilla.org", "localhost", "drive.google.com"];
const minute = 60_000 / speed;

class Seat {
  token = "";
  queue: Event[] = [];
  silentUntil = 0;
  gone = false;
  done = false;
  constructor(
    readonly n: number,
    readonly plan: Plan,
  ) {}

  get label() {
    return String(this.n);
  }

  record(type: string, detail?: Record<string, number | string>) {
    this.queue.push({ type, detail, at: Date.now() });
  }

  async join(): Promise<boolean> {
    const res = await fetch(`${baseUrl}/api/lab/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, rollNumber: rollFor(this.n), seatLabel: this.label, version: "sim" }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
    if (!res.ok || !body.token) {
      console.error(`Seat ${this.n}: ${body.message ?? res.status}`);
      return false;
    }
    this.token = body.token;
    return true;
  }

  async beat(leave = false) {
    if (this.done || this.gone || Date.now() < this.silentUntil) return;
    const events = this.queue.splice(0);
    const res = await fetch(`${baseUrl}/api/lab/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ events, leave: leave || undefined }),
    }).catch(() => null);
    if (!res) {
      this.queue.unshift(...events);
      return;
    }
    if (res.status === 401) {
      this.done = true;
      return;
    }
    if (!res.ok) return;
    const { session } = (await res.json()) as { session: { active: boolean } };
    if (!session.active) this.done = true;
  }
}

function everyday(n: number): Plan {
  // A few ordinary things at random moments, the same each run for a seat.
  let seed = n * 7919;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plan: Plan = [];
  for (let t = 0.5 + rand(); t < minutes; t += 0.8 + rand() * 1.5) {
    const roll = rand();
    const host = studyHosts[Math.floor(rand() * studyHosts.length)]!;
    if (roll < 0.5) plan.push({ at: t, run: (s) => s.record("tab_switch", { host }) });
    else if (roll < 0.75) plan.push({ at: t, run: (s) => s.record("copy", { chars: 10 + Math.floor(rand() * 200) }) });
    else plan.push({ at: t, run: (s) => s.record("paste", { chars: 10 + Math.floor(rand() * 400) }) });
  }
  return plan;
}

function scripted(n: number): Plan {
  switch (n) {
    case 14:
      return [
        { at: 1, run: (s) => s.record("blocked_site", { host: "chatgpt.com" }) },
        { at: 1.4, run: (s) => s.record("blocked_site", { host: "chatgpt.com" }) },
        { at: 4, run: (s) => s.record("blocked_site", { host: "gemini.google.com" }) },
      ];
    case 7:
      return [{ at: 2, run: (s) => void (s.silentUntil = Date.now() + 45_000) }];
    case 22:
      return [{ at: 3, run: (s) => void (s.gone = true) }];
    case 9:
      return [
        { at: 1.5, run: (s) => s.record("left_browser") },
        { at: 1.5 + 1.5, run: (s) => s.record("returned", { seconds: Math.round(90 / speed) }) },
      ];
    case 3:
      return [
        { at: 2.5, run: (s) => s.record("idle") },
        { at: 4.5, run: (s) => s.record("active", { seconds: Math.round(120 / speed) }) },
      ];
    case 18:
      return [{ at: Math.min(5, minutes * 0.6), run: async (s) => { await s.beat(true); s.done = true; } }];
    case 25:
      return [{ at: 4, run: async (s) => void (await s.join()) }];
    default:
      return [];
  }
}

const seats = Array.from({ length: seatCount }, (_, i) => {
  const n = i + 1;
  return new Seat(n, [...scripted(n), ...everyday(n)].sort((a, b) => a.at - b.at));
});

console.log(`Joining ${seatCount} seats at ${baseUrl} with code ${code}…`);
const start = Date.now();
await Promise.all(
  seats.map(async (seat, i) => {
    await new Promise((r) => setTimeout(r, i * 400)); // staggered, like a real lab
    if (!(await seat.join())) seat.done = true;
  }),
);
const joined = seats.filter((s) => !s.done).length;
if (joined === 0) fail("No seat could join. Is the site running and the code right?");
console.log(`${joined} seats recording. Open the session in the teacher app to watch. Ctrl+C to stop.`);

const timers: NodeJS.Timeout[] = [];
for (const seat of seats) {
  if (seat.done) continue;
  for (const step of seat.plan) {
    timers.push(setTimeout(() => void (seat.done || seat.gone ? null : step.run(seat)), step.at * minute));
  }
  // Heartbeats every 10 s, offset per seat.
  timers.push(
    setTimeout(() => {
      timers.push(setInterval(() => void seat.beat(), 10_000));
    }, (seat.n % 10) * 1000),
  );
}

const finish = () => {
  for (const t of timers) clearTimeout(t);
  const active = seats.filter((s) => !s.done && !s.gone).length;
  console.log(`Done after ${Math.round((Date.now() - start) / 1000)} s. ${active} seats were still recording.`);
  process.exit(0);
};
process.on("SIGINT", finish);

// Stop at the end of the run, or once every seat has stopped.
const watch = setInterval(() => {
  if (Date.now() - start >= minutes * 60_000 || seats.every((s) => s.done || s.gone)) {
    clearInterval(watch);
    finish();
  }
}, 2_000);
