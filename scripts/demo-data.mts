/**
 * S11 demo data: four weeks of realistic class activity on top of `pnpm seed`.
 *
 *   pnpm demo:data            replace all demo activity, then refresh weekly_metrics
 *   pnpm demo:data --dry-run  build everything in memory and print the totals only
 *
 * The 30 seeded students get one of three patterns (PLAN.md S11): 5 heavy
 * copiers, 15 healthy learners and 10 light users. Riya Sharma (the demo
 * student) is a healthy learner who leans on Sage a little this week, so the
 * demo's paste-and-insist run puts her in the amber Reliance band.
 *
 * Writes, all relative to now: past and current assignments (fixed ids; the
 * seeded ones get fresh due dates), the ME201 lecture-notes PDF
 * (public/demo/me201-thermodynamics-notes.pdf) as a ready course material,
 * Sage conversations with labelled messages, flags from the real flag rules,
 * Trace submissions with writing events, snapshots and integrity reports,
 * then weekly_metrics for the last 6 weeks.
 *
 * Idempotent: it first deletes every conversation, submission and flag of the
 * seeded (@demo.safesight.in) students in the two demo courses. Real sign-ups
 * are never touched. Runs with the service role; uses the app's own ladder,
 * flag rules and Trace metrics so the numbers match what the app computes.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { decideFlags, type FlagSeverity, type FlagType } from "../src/lib/sage/flags";
import { toDbIntent, type Intent, type Labels } from "../src/lib/sage/labels";
import { assignmentKind, type SageAssignment } from "../src/lib/sage/match";
import { decidePolicy, type LadderState } from "../src/lib/sage/policy";
import { examModeReply } from "../src/lib/sage/prompt";
import { measureHtml } from "../src/lib/trace/html";
import { computeMetrics, type TimedEvent } from "../src/lib/trace/metrics";
import { templateSummary } from "../src/lib/trace/summary";
import type { Database, Json } from "../src/lib/supabase/database.types";
import {
  answerSeeking,
  overrideAttempts,
  sageReply,
  stressed,
  thanks,
  topics,
  writing,
  type Topic,
} from "./demo/content";
import {
  COURSE,
  DEMO_COURSES,
  MATERIALS_BUCKET,
  NOTES_FILE,
  NOTES_MATERIAL_ID,
  NOTES_TITLE,
  PS3_ID,
  PS3_TITLE,
  RIYA_EMAIL,
  db,
  demoStudents,
  fail,
  insertAll,
  refreshMetrics,
} from "./demo/common";

type Tables = Database["public"]["Tables"];
type Mode = "learn" | "assist" | "exam";

const dryRun = process.argv.includes("--dry-run");

// ------------------------------------------------------------------ random, time

/** Deterministic PRNG so every run tells the same story (only "now" moves). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261016);
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const chance = (p: number) => rnd() < p;
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;

const now = Date.now();
/** Nothing is dated in the last 15 minutes, so a rehearsal right after looks fresh. */
const latest = now - 15 * MINUTE;
const istToday = Math.floor((now + IST) / DAY) * DAY - IST; // 00:00 IST today, as UTC ms
const weekStart = istToday - ((new Date(istToday + IST).getUTCDay() + 6) % 7) * DAY; // Monday 00:00 IST
const iso = (t: number) => new Date(t).toISOString();

/** Hours students study (IST), weighted towards the evening. */
const studyHours = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 20, 21, 21, 21, 22, 22, 22, 23, 23, 0];

/** A study-session start between two day offsets (negative = past), leaning towards `to`. */
function sessionStart(fromDay: number, toDay: number, room = 60 * MINUTE) {
  for (let tries = 0; tries < 20; tries++) {
    const span = Math.max(0, toDay - fromDay);
    const day = toDay - Math.floor(rnd() ** 1.6 * (span + 1));
    const hour = pick(studyHours);
    const t = istToday + day * DAY + (hour === 0 ? 24 : hour) * HOUR + int(0, 55) * MINUTE;
    if (t + room <= latest) return t;
  }
  return latest - room - int(1, 8) * HOUR;
}

// ------------------------------------------------------------------ class plan

const pattern: Record<string, "heavy" | "healthy" | "light"> = {};
const heavy = ["Kabir Singh", "Ishita Banerjee", "Rahul Verma", "Harsh Agarwal", "Aditi Ghosh"];
const light = [
  "Rohan Gupta", "Meera Pillai", "Nikhil Chauhan", "Yash Malhotra", "Karan Kapoor",
  "Varun Saxena", "Lakshmi Subramanian", "Arnav Thakur", "Simran Kaur", "Dev Choudhary",
];

type Assignment = {
  id: string;
  course: string;
  title: string;
  instructions: string;
  mode: Mode;
  /** Day offsets from today (IST). */
  created: number;
  due: number;
  topics: (keyof typeof topics)[];
  /** Written in Trace. */
  writing?: keyof typeof writing;
  notes?: string;
};

const A = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const assignments: Assignment[] = [
  // ME201 Thermodynamics (all 30 students)
  {
    id: A(206), course: COURSE.thermo, title: "Thermodynamics problem set 1", mode: "learn", created: -30, due: -22,
    instructions: "Problems 1–8 on systems, temperature scales and boundary work. State your sign convention for work in every answer.",
    topics: ["signConvention", "boundaryWork", "temperatureScales"],
    notes: "Most students confuse work done by and on the system. Ask them to draw the boundary first.",
  },
  {
    id: A(208), course: COURSE.thermo, title: "Essay: heat engines around us", mode: "assist", created: -26, due: -12,
    instructions: "In 600–800 words, describe two heat engines you see around you and what limits their efficiency. Write it in Trace.",
    topics: ["carnot"], writing: "heatEngines",
    notes: "Sage may explain the Carnot limit fully, but the essay must be the student's own writing.",
  },
  {
    id: A(207), course: COURSE.thermo, title: "Thermodynamics problem set 2", mode: "learn", created: -18, due: -8,
    instructions: "Problems 1–7 on pure substances, steam tables, quality and the ideal gas equation. Show which table you used for each value.",
    topics: ["steamTables", "quality", "idealGas"],
  },
  {
    id: A(202), course: COURSE.thermo, title: "Essay: entropy in everyday life", mode: "assist", created: -6, due: 12,
    instructions: "In 600–800 words, explain entropy with two examples from daily life. Write it in Trace.",
    topics: ["entropy"], writing: "entropy",
    notes: "Sage may explain entropy fully, but the essay must be the student's own writing.",
  },
  {
    id: PS3_ID, course: COURSE.thermo, title: "Thermodynamics problem set 3", mode: "learn", created: -1, due: 5,
    instructions:
      "Solve problems 1–6 on the first law for closed systems and polytropic processes. Show each step, state your sign convention for work, and give units in every line.",
    // Released yesterday: no class activity yet. Riya uses it on stage.
    topics: [],
    notes: "Students often mix up work done by and on the system. Push them to draw the system boundary first.",
  },
  {
    id: A(203), course: COURSE.thermo, title: "Mid-semester test", mode: "exam", created: -10, due: 19,
    instructions: "Closed-book test in class. Sage is switched off for this one.", topics: [],
  },
  // ME204 Fluid Mechanics (first 20 students)
  {
    id: A(209), course: COURSE.fluids, title: "Fluid statics problem set", mode: "learn", created: -27, due: -16,
    instructions: "Problems 1–6 on hydrostatic pressure, manometers and buoyancy. Use g = 9.81 m/s².",
    topics: ["hydrostatic", "manometer", "buoyancy"],
  },
  {
    id: A(210), course: COURSE.fluids, title: "Lab report: hydrostatic force on a plane surface", mode: "assist", created: -15, due: -5,
    instructions: "Write up the hydrostatic force experiment: aim, theory, readings, results and a discussion of errors. Write it in Trace.",
    topics: ["hydrostaticForce", "errorAnalysis"], writing: "hydrostaticReport",
  },
  {
    id: A(204), course: COURSE.fluids, title: "Bernoulli's equation worksheet", mode: "learn", created: -8, due: 7,
    instructions: "Work through the five pipe-flow problems. State your assumptions before applying Bernoulli's equation.",
    topics: ["bernoulliAssumptions", "pipeVelocity"],
    notes: "Check that students state steady, incompressible, frictionless flow before using it.",
  },
  {
    id: A(205), course: COURSE.fluids, title: "Lab report: flow through a venturi meter", mode: "assist", created: -4, due: 14,
    instructions: "Write up the venturi meter lab: aim, method, readings, discharge coefficient and sources of error.",
    topics: ["venturi", "errorAnalysis"],
  },
];
const byId = new Map(assignments.map((a) => [a.id, a]));

// ------------------------------------------------------------------ output buffers

const conversations: Tables["conversations"]["Insert"][] = [];
const messages: Tables["messages"]["Insert"][] = [];
const flags: (Tables["flags"]["Insert"] & { created_at: string })[] = [];
const submissions: Tables["submissions"]["Insert"][] = [];
const events: Tables["writing_events"]["Insert"][] = [];
const snapshots: Tables["writing_snapshots"]["Insert"][] = [];
const reports: Tables["integrity_reports"]["Insert"][] = [];

const NOTES_UPLOADED = istToday - 25 * DAY + 11 * HOUR;
/** Open flags per student+course, for the rules' 24-hour de-duplication. */
const raised = new Map<string, { type: FlagType; severity: FlagSeverity; at: number }[]>();

// ------------------------------------------------------------------ Sage conversations

type Turn =
  | { kind: "concept" | "attempt" | "share" | "seek" | "paste" | "override" | "thanks" | "stressed" | "exam"; text?: string };

function labelsFor(turn: Turn, topic: Topic | null, assignmentId: string): Labels {
  const base = {
    attemptQuality: 0,
    sharesWorking: false,
    claimsPermission: false,
    distress: "none" as const,
    topic: topic?.label ?? "",
    // Demo chats are about their own assignment.
    match: { assignmentId, similarity: 0.7 },
    source: "model" as const,
  };
  switch (turn.kind) {
    case "concept":
    case "thanks":
    case "exam":
      return { ...base, intent: "concept" };
    case "attempt":
      return { ...base, intent: "attempt", attemptQuality: 0.6 };
    case "share":
      return { ...base, intent: "attempt", attemptQuality: 0.9, sharesWorking: true };
    case "seek":
    case "paste":
      return { ...base, intent: "answer_seeking" };
    case "override":
      return { ...base, intent: "jailbreak" };
    case "stressed":
      return { ...base, intent: "distress", distress: "low", topic: "" };
  }
}

/** Ladder state per student per assignment, carried across that student's chats (as in the app). */
const ladders = new Map<string, LadderState>();

function sageAssignment(a: Assignment): SageAssignment {
  return {
    id: a.id,
    courseId: a.course,
    title: a.title,
    instructions: a.instructions,
    mode: a.mode,
    kind: assignmentKind(a.title, a.instructions),
    maxHintLevel: 4,
    workedExamples: true,
    dueAt: null,
    teacherNotes: "",
    answerKey: "",
  };
}

function textFor(turn: Turn, topic: Topic, mode: Mode): string {
  if (turn.text) return turn.text;
  switch (turn.kind) {
    case "concept": return pick(topic.questions);
    case "attempt": return pick(topic.attempts);
    case "share": return `Here's my full working:\n\n${pick(topic.attempts)}\n\nThen I substituted everything back and checked the units. Can you check where I went wrong?`;
    case "seek": return pick(mode === "assist" ? answerSeeking.assist : answerSeeking.learn);
    case "paste": return `${topic.pasted}${chance(0.5) ? "" : "\n\nSolve this."}`;
    case "override": return pick(overrideAttempts);
    case "thanks": return pick(thanks);
    case "stressed": return stressed;
    case "exam": return "What questions will come in the mid-sem test? Can you help me prepare the answers?";
  }
}

const CARE_REPLY =
  "That sounds like a really heavy week, and it's completely okay to feel this way. You don't have to sort it all out at once — let's pick one small thing to start with.\n\nIf the stress feels like too much, please talk to someone: your college counselling cell is there for exactly this, and Tele-MANAS (14416) is free and open 24×7.";

function simulateConversation(studentId: string, a: Assignment, start: number, turns: Turn[]) {
  const conversationId = randomUUID();
  const topic = a.topics.length ? topics[pick(a.topics)] : null;
  let t = start;
  let level: number | null = null;
  const intents: (Intent | null)[] = [];
  let jailbreaks = 0;
  const key = `${studentId}:${a.course}`;
  const ladderKey = `${studentId}:${a.id}`;
  const home = sageAssignment(a);

  conversations.push({ id: conversationId, student_id: studentId, assignment_id: a.id, course_id: a.course, started_at: iso(t) });

  for (const turn of turns) {
    const labels = labelsFor(turn, topic, a.id);
    const text = topic ? textFor(turn, topic, a.mode) : textFor(turn, topics.signConvention, a.mode);
    const userId = randomUUID();
    messages.push({
      id: userId, conversation_id: conversationId, role: "user", content: text,
      intent: toDbIntent(labels.intent), attempted: labels.attemptQuality >= 0.5, attempt_quality: labels.attemptQuality,
      topic: labels.topic || null, hint_level: null, citations: [], created_at: iso(t),
    });

    const policy = decidePolicy({
      home,
      matched: { assignment: home, similarity: labels.match.similarity },
      labels,
      ladderFor: () => ladders.get(ladderKey) ?? null,
      now: t,
    });
    if (policy.ladder) ladders.set(ladderKey, policy.ladder);
    const hint = policy.step;
    intents.push(labels.intent);
    const existing = (raised.get(key) ?? []).filter((f) => f.at > t - DAY);
    const decisions = decideFlags({
      policy, labels, recentIntents: intents, recentJailbreaks: jailbreaks, context: a.title, existing,
    });
    if (labels.intent === "jailbreak") jailbreaks++;
    for (const d of decisions) {
      flags.push({
        student_id: studentId, course_id: a.course, message_id: userId, type: d.type, severity: d.severity,
        reason: d.reason, status: "open", resolved_at: null, created_at: iso(t + 2 * SECOND),
      });
      raised.set(key, [...(raised.get(key) ?? []), { type: d.type, severity: d.severity, at: t }]);
    }

    let reply: string;
    if (a.mode === "exam") reply = examModeReply(a.title);
    else if (turn.kind === "stressed") reply = CARE_REPLY;
    else
      reply = sageReply(rnd, topic ?? topics.signConvention, hint ?? 1, {
        insisted: turn.kind === "seek" || turn.kind === "override",
        thanks: turn.kind === "thanks",
        sameStep: hint !== null && hint === level,
      });
    const cite =
      a.course === COURSE.thermo && topic?.notesPage && hint && hint >= 2 && hint <= 4 && t > NOTES_UPLOADED
        ? [{ materialId: NOTES_MATERIAL_ID, title: NOTES_TITLE, page: topic.notesPage }]
        : [];
    t += int(6, 25) * SECOND;
    messages.push({
      id: randomUUID(), conversation_id: conversationId, role: "assistant", content: reply,
      intent: null, attempted: null, attempt_quality: null, topic: null, hint_level: hint, citations: cite as unknown as Json,
      created_at: iso(t),
    });
    if (hint) level = hint;
    t += int(40, 300) * SECOND;
  }
}

/** The student's turns for one conversation, by pattern. */
function plan(kind: "heavy" | "healthy" | "light" | "riya", weekFactor: number): Turn[] {
  const turns: Turn[] = [];
  if (kind === "heavy") {
    turns.push({ kind: chance(0.7) ? "seek" : "paste" });
    const n = int(2, 5);
    for (let i = 1; i < n; i++) {
      const r = rnd();
      turns.push({ kind: r < 0.74 ? "seek" : r < 0.82 ? "paste" : r < 0.9 ? "concept" : r < 0.97 ? "attempt" : "thanks" });
    }
    return turns;
  }
  if (kind === "light") {
    turns.push({ kind: "concept" });
    const n = int(1, 3);
    for (let i = 1; i < n; i++) turns.push({ kind: chance(0.5) ? "attempt" : chance(0.5) ? "concept" : "thanks" });
    return turns;
  }
  // Healthy learners ask less for answers as the weeks go on.
  const seek = kind === "riya" ? 0.2 : 0.12 * (1 - 0.6 * weekFactor);
  turns.push({ kind: chance(0.65) ? "concept" : "attempt" });
  const n = int(3, 7);
  for (let i = 1; i < n; i++) {
    const r = rnd();
    if (i >= 3 && r < 0.18) {
      turns.push({ kind: "thanks" });
      break;
    }
    turns.push({ kind: r < seek ? "seek" : r < 0.55 ? (i >= 2 && chance(0.35) ? "share" : "attempt") : "concept" });
  }
  return turns;
}

// ------------------------------------------------------------------ Trace

type Para = { text: string; pasted: boolean };
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const visible = (s: string) => s.replace(/\s/g, "").length;

function renderHtml(done: Para[], partial: Para | null) {
  const all = partial ? [...done, partial] : done;
  return all
    .map((p) => `<p>${p.pasted ? `<span data-trace-paste="">${escapeHtml(p.text)}</span>` : escapeHtml(p.text)}</p>`)
    .join("");
}

/** A document for one writer: typed paragraphs in order, maybe with pasted text. */
function composeDoc(kind: "heavy" | "healthy" | "light" | "riya", w: { typed: string[]; pasted: string[] }): Para[] {
  const typed = w.typed;
  const sentences = (s: string) => s.match(/[^.]+\.\s*/g) ?? [s];
  if (kind === "heavy") {
    const out: Para[] = [{ text: typed[0], pasted: false }, { text: w.pasted[0], pasted: true }];
    if (chance(0.5)) out.push({ text: typed[typed.length - 1], pasted: false });
    return out;
  }
  if (kind === "riya") {
    return [
      { text: typed[0], pasted: false },
      { text: typed[1], pasted: false },
      { text: sentences(w.pasted[0]).slice(0, 4).join("").trim(), pasted: true },
      { text: typed[2], pasted: false },
    ];
  }
  if (kind === "light") {
    const out: Para[] = typed.slice(0, int(2, 3)).map((text) => ({ text, pasted: false }));
    if (chance(0.5)) out.splice(1, 0, { text: sentences(w.pasted[0]).slice(0, int(2, 3)).join("").trim(), pasted: true });
    return out;
  }
  const keep = typed.filter((_, i) => i === 0 || i === typed.length - 1 || chance(0.75));
  const out: Para[] = keep.map((text) => ({ text, pasted: false }));
  if (chance(0.3)) out.splice(int(1, out.length - 1), 0, { text: sentences(w.pasted[0])[0].trim(), pasted: true });
  return out;
}

/**
 * Writes the doc over `sessionStarts`, recording events the way the editor
 * does (coalesced keystrokes every few seconds, deletes, focus/blur, one
 * event per paste) and a snapshot about every 40 s. Returns the end time.
 */
function writeDoc(
  submissionId: string,
  owner: { assignment_id: string; student_id: string },
  doc: Para[],
  sessionStarts: number[],
  submit: boolean,
): number {
  const local: TimedEvent[] = [];
  const perSession = Math.ceil(doc.length / sessionStarts.length);
  const done: Para[] = [];
  let t = sessionStarts[0];
  let lastSnap = 0;
  const ev = (type: TimedEvent["type"], size: number) => {
    local.push({ type, size, at: t });
    events.push({ submission_id: submissionId, type, size, at: iso(t) });
  };
  const snap = (partial: Para | null) => {
    const html = renderHtml(done, partial);
    snapshots.push({ submission_id: submissionId, content: html, char_count: visible(done.map((p) => p.text).join("") + (partial?.text ?? "")), at: iso(t) });
    lastSnap = t;
  };

  sessionStarts.forEach((start, s) => {
    // A new session starts after the session gap (30 min), even if planned closer.
    if (s > 0) t = Math.max(start, t + 31 * MINUTE);
    ev("focus", 0);
    for (const para of doc.slice(s * perSession, (s + 1) * perSession)) {
      if (para.pasted) {
        t += int(5, 40) * SECOND;
        done.push(para);
        ev("paste", visible(para.text));
        snap(null);
        t += int(20, 90) * SECOND;
        continue;
      }
      let i = 0;
      while (i < para.text.length) {
        const step = int(3, 9);
        const chunk = para.text.slice(i, i + step);
        i += step;
        t += int(15, 50) * 100;
        if (chance(0.03)) t += int(20, 120) * SECOND; // thinking
        ev("type", visible(chunk));
        if (chance(0.04)) {
          const n = int(2, 8);
          t += int(10, 30) * 100;
          ev("delete", n);
          t += int(10, 30) * 100;
          ev("type", n);
        }
        if (t - lastSnap > 40 * SECOND) snap({ text: para.text.slice(0, i), pasted: false });
      }
      done.push(para);
      t += int(10, 60) * SECOND;
    }
    snap(null);
    ev("blur", 0);
  });

  const html = renderHtml(done, null);
  const submittedAt = t + int(1, 5) * MINUTE;
  submissions.push({
    id: submissionId,
    ...owner,
    content: html,
    submitted_at: submit ? iso(submittedAt) : null,
    created_at: iso(sessionStarts[0]),
    updated_at: iso(submit ? submittedAt : t),
  });
  if (submit) {
    const metrics = computeMetrics(local, measureHtml(html));
    reports.push({
      submission_id: submissionId,
      paste_ratio: metrics.pasteRatio,
      active_minutes: metrics.activeMinutes,
      sessions: metrics.sessions,
      summary: templateSummary(metrics),
      created_at: iso(submittedAt + 20 * SECOND),
    });
  }
  return submittedAt;
}

function traceWork(
  studentId: string,
  a: Assignment,
  kind: "heavy" | "healthy" | "light" | "riya",
  window: [number, number],
  submit = true,
  fixedStarts?: number[],
) {
  const id = randomUUID();
  const doc = composeDoc(kind, writing[a.writing!]);
  const sessions = kind === "healthy" ? int(2, 3) : kind === "light" ? int(1, 2) : 1;
  const starts =
    fixedStarts ??
    Array.from({ length: sessions }, () => sessionStart(window[0], window[1], 3 * HOUR)).sort((x, y) => x - y);
  const draft = doc.slice(0, Math.max(1, Math.floor(doc.length / 2)));
  writeDoc(id, { assignment_id: a.id, student_id: studentId }, submit ? doc : draft, starts, submit);
}

// ------------------------------------------------------------------ build

const students = await demoStudents();
const { data: profiles, error: profilesError } = await db.from("profiles").select("id, full_name").in("id", [...students.values()]);
fail("profiles", profilesError);
const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
const riyaId = students.get(RIYA_EMAIL);
if (!riyaId || students.size < 30) {
  console.error(`Expected the 30 seeded students (found ${students.size}). Run \`pnpm seed\` first.`);
  process.exit(1);
}
const { data: enrolled, error: enrollError } = await db.from("enrollments").select("course_id, student_id").in("course_id", DEMO_COURSES);
fail("enrollments", enrollError);
const ids = [...students.values()];
for (const id of ids) {
  const fullName = nameOf.get(id) ?? "";
  pattern[id] = heavy.includes(fullName) ? "heavy" : light.includes(fullName) ? "light" : "healthy";
}
const inCourse = (course: string, student: string) => (enrolled ?? []).some((e) => e.course_id === course && e.student_id === student);

// Sage conversations, generated in time order per student so flag de-duplication matches the app.
type Planned = { student: string; a: Assignment; start: number; turns: Turn[] };
const planned: Planned[] = [];
const weekFactor = (t: number) => Math.min(1, Math.max(0, 1 - (now - t) / (28 * DAY)));

for (const student of ids) {
  const kind = pattern[student];
  const mine = assignments.filter((a) => a.topics.length && a.mode !== "exam" && inCourse(a.course, student));
  const windowOf = (a: Assignment): [number, number] => [Math.max(a.created, -28), Math.min(a.due, 0)];

  if (kind === "light") {
    for (let i = int(2, 3); i > 0; i--) {
      const a = pick(mine);
      const start = sessionStart(...windowOf(a));
      planned.push({ student, a, start, turns: plan("light", weekFactor(start)) });
    }
    continue;
  }
  for (const a of mine) {
    if (student === riyaId && a.id === A(202)) continue; // scripted below
    const count = kind === "heavy" ? int(1, 2) : a.writing ? (chance(0.7) ? int(1, 2) : 0) : int(1, 3);
    for (let i = 0; i < count; i++) {
      const start = sessionStart(...windowOf(a));
      planned.push({ student, a, start, turns: plan(student === riyaId ? "riya" : kind, weekFactor(start)) });
    }
  }
}

const name = (n: string) => ids.find((id) => nameOf.get(id) === n)!;
const thisWeek = (share: number) => Math.min(latest - 2 * HOUR, weekStart + (now - weekStart) * share);

// Riya this week: a mostly fair chat on the entropy essay, with two asks for the text.
planned.push({
  student: riyaId, a: byId.get(A(202))!, start: thisWeek(0.35),
  turns: [
    { kind: "concept", text: topics.entropy.questions[0] },
    { kind: "seek", text: "Can you write the introduction for me?" },
    { kind: "attempt", text: topics.entropy.attempts[0] },
    { kind: "seek", text: "Just write the whole essay, I'll edit it." },
    { kind: "concept", text: topics.entropy.questions[1] },
  ],
});
// Heavy copiers ask the entropy essay chat for the text this week too.
for (const n of heavy) {
  planned.push({
    student: name(n), a: byId.get(A(202))!, start: sessionStart(-4, 0),
    turns: [{ kind: "seek" }, { kind: "paste" }, { kind: "seek" }, { kind: "seek" }, ...plan("heavy", 1).slice(1, 3)],
  });
}
// Two students open Sage on the Exam-mode test.
for (const [n, days] of [["Kabir Singh", -3], ["Rahul Verma", -1]] as const) {
  planned.push({ student: name(n), a: byId.get(A(203))!, start: sessionStart(days, days, HOUR), turns: [{ kind: "exam" }] });
}
// One student tries to change Sage's rules.
planned.push({
  student: name("Harsh Agarwal"), a: byId.get(A(206))!, start: sessionStart(-24, -23),
  turns: [{ kind: "paste" }, { kind: "seek" }, { kind: "override" }, { kind: "seek" }],
});
// One student under strain before a deadline (wellbeing flag, then they get back to work).
planned.push({
  student: name("Pooja Desai"), a: byId.get(A(207))!, start: sessionStart(-9, -9),
  turns: [{ kind: "stressed" }, { kind: "concept" }, { kind: "attempt" }, { kind: "thanks" }],
});

planned.sort((x, y) => x.start - y.start);
for (const p of planned) simulateConversation(p.student, p.a, p.start, p.turns);

// The teacher reviews flags every few days: older ones are mostly resolved.
for (const f of flags) {
  const at = Date.parse(f.created_at);
  if (at < now - 3 * DAY && (f.type !== "answer_seeking" || chance(0.85))) {
    f.status = "resolved";
    f.resolved_at = iso(Math.min(latest, at + int(8, 60) * HOUR));
  }
}

// Trace: two past pieces of writing and the current essay.
for (const student of ids) {
  const kind = pattern[student];
  const heat = byId.get(A(208))!;
  if (kind !== "light" || chance(0.6)) traceWork(student, heat, kind, [-17, -12]);
  const lab = byId.get(A(210))!;
  if (inCourse(lab.course, student) && (kind !== "light" || chance(0.5))) traceWork(student, lab, kind, [-9, -5]);
}
const entropy = byId.get(A(202))!;
const fresh = (share: number) => [thisWeek(share)];
traceWork(riyaId, entropy, "riya", [0, 0], true, fresh(0.6));
const early = ids.filter((id) => pattern[id] === "healthy" && id !== riyaId).slice(0, 5);
early.forEach((id, i) => traceWork(id, entropy, "healthy", [-5, 0], true, [sessionStart(-5, 0, 2 * HOUR) - i * MINUTE]));
traceWork(name("Aditi Ghosh"), entropy, "heavy", [-3, 0]);
for (const id of ids.filter((id) => pattern[id] === "healthy").slice(6, 9)) traceWork(id, entropy, "healthy", [-3, 0], false);

// ------------------------------------------------------------------ write

const count = (rows: { length: number }) => rows.length.toLocaleString("en-IN");
console.log(`Students     ${ids.length} (heavy ${heavy.length}, healthy ${ids.length - heavy.length - light.length}, light ${light.length})`);
console.log(`Chats        ${count(conversations)} conversations, ${count(messages)} messages`);
console.log(`Flags        ${count(flags)} (${flags.filter((f) => f.status !== "resolved").length} open)`);
console.log(`Trace        ${count(submissions)} submissions, ${count(events)} events, ${count(snapshots)} snapshots`);
if (dryRun) {
  const by: Record<string, number> = {};
  for (const f of flags) {
    const k = `${pattern[f.student_id]} · ${f.type} · ${f.severity} · ${f.status ?? "open"}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(by).sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);
  process.exit(0);
}

// PostgREST bulk inserts take the union of the rows' keys, so every row above sets every column.

// Assignments: fixed ids, dates relative to today.
const { error: aErr } = await db.from("assignments").upsert(
  assignments.map((a) => ({
    id: a.id, course_id: a.course, title: a.title, instructions: a.instructions, ai_mode: a.mode,
    due_at: iso(istToday + a.due * DAY + 23 * HOUR + 59 * MINUTE), created_at: iso(istToday + a.created * DAY + 10 * HOUR),
  })),
);
fail("assignments", aErr);
const notes = assignments.filter((a) => a.notes).map((a) => ({ assignment_id: a.id, notes: a.notes! }));
fail("notes", (await db.from("assignment_teacher_notes").upsert(notes, { onConflict: "assignment_id" })).error);

// Clear earlier demo activity of the seeded students in the demo courses.
const { data: courseAssignments } = await db.from("assignments").select("id").in("course_id", DEMO_COURSES);
const assignmentIds = (courseAssignments ?? []).map((a) => a.id);
for (let i = 0; i < ids.length; i += 50) {
  const chunk = ids.slice(i, i + 50);
  fail("clear flags", (await db.from("flags").delete().in("student_id", chunk).in("course_id", DEMO_COURSES)).error);
  fail("clear chats", (await db.from("conversations").delete().in("student_id", chunk).in("assignment_id", assignmentIds)).error);
  fail("clear work", (await db.from("submissions").delete().in("student_id", chunk).in("assignment_id", assignmentIds)).error);
  fail("clear ladder", (await db.from("sage_ladder_state").delete().in("student_id", chunk).in("assignment_id", assignmentIds)).error);
}

// A problem set 3 or notes created live in a rehearsal would sit next to the fixed ones.
fail("old PS3", (await db.from("assignments").delete().eq("course_id", COURSE.thermo).ilike("title", PS3_TITLE).neq("id", PS3_ID)).error);
const { data: oldNotes } = await db.from("materials").select("id, file_path").eq("course_id", COURSE.thermo).neq("id", NOTES_MATERIAL_ID);
if (oldNotes?.length) {
  await db.storage.from(MATERIALS_BUCKET).remove(oldNotes.map((m) => m.file_path));
  fail("old notes", (await db.from("materials").delete().in("id", oldNotes.map((m) => m.id))).error);
}

// Lecture notes PDF → Storage → chunks (keyword search; "Read again" adds vectors once embeddings are set).
const path = `${COURSE.thermo}/${NOTES_MATERIAL_ID}.pdf`;
const pdf = await readFile(NOTES_FILE);
fail("upload notes", (await db.storage.from(MATERIALS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true })).error);
fail("notes row", (await db.from("materials").upsert({
  id: NOTES_MATERIAL_ID, course_id: COURSE.thermo, title: NOTES_TITLE, file_path: path, status: "processing", created_at: iso(NOTES_UPLOADED),
})).error);
const { ingestMaterial } = await import("../src/lib/materials/ingest");
const ingest = await ingestMaterial(NOTES_MATERIAL_ID);
if (ingest.status !== "ready") throw new Error(`notes ingest: ${ingest.error}`);

await insertAll("conversations", conversations);
await insertAll("messages", messages);
await insertAll("flags", flags);
await insertAll("submissions", submissions);
await insertAll("writing_events", events, 1000);
await insertAll("writing_snapshots", snapshots, 200);
await insertAll("integrity_reports", reports);
await insertAll(
  "sage_ladder_state",
  [...ladders].map(([key, l]) => {
    const [student_id, assignment_id] = key.split(":");
    return { student_id, assignment_id, step: l.step, attempts: l.attempts, last_example_at: l.lastExampleAt, updated_at: new Date().toISOString() };
  }),
);
const rows = await refreshMetrics(6);

console.log(`Notes        ${NOTES_TITLE}: ${ingest.pages} pages, ${ingest.chunks} chunks${ingest.embedded ? " (with vectors)" : " (keyword search)"}`);
console.log(`Metrics      ${rows} weekly rows`);

// The latest Reliance Score per student in ME201, so the bands can be checked at a glance.
const { data: latestWeek } = await db
  .from("weekly_metrics")
  .select("student_id, week, reliance_score")
  .eq("course_id", COURSE.thermo)
  .order("week", { ascending: false });
const seen = new Set<string>();
const scores = (latestWeek ?? []).filter((r) => !seen.has(r.student_id) && seen.add(r.student_id));
for (const kind of ["heavy", "healthy", "light"] as const) {
  const list = scores
    .filter((s) => pattern[s.student_id] === kind)
    .map((s) => `${nameOf.get(s.student_id)?.split(" ")[0]} ${Math.round(s.reliance_score)}`);
  console.log(`ME201 ${kind.padEnd(7)} ${list.join(", ")}`);
}
