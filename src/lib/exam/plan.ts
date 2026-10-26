import { relatedTopics, topicKey, topicLabel } from "@/lib/learning/topics";

/**
 * The revision plan (S20), pure so every number can be tested and explained:
 * which topics go in and how much each one weighs (`planTopics`), and how the
 * days up to the exam are filled (`buildSchedule`). No model call decides the
 * plan; the model only reads topics out of the notes and writes mock tests.
 */

export type NoteRef = { materialId: string; title: string; page: number | null };

export type TopicSource = "syllabus" | "notes" | "yours";

export type BaseTopic = { title: string; unit?: string | null; source: TopicSource; notes?: NoteRef[] };

export type StudentSignals = {
  mastery: { topic: string; topicKey: string; mastery: number; evidence: number }[];
  mistakes: { label: string; topic: string; count: number; reviewed: boolean }[];
  /** Questions the student asked Sage per topic (recent weeks). */
  asked: { topic: string; count: number }[];
};

export type PlanTopic = {
  key: string;
  title: string;
  unit: string | null;
  source: TopicSource;
  /** How much revision time it gets, relative to the others (1 = a strong, quiet topic). */
  weight: number;
  mastery: number | null;
  /** Practice checks the mastery rests on. */
  evidence: number;
  /** Unreviewed repeated mistakes on it. */
  mistakes: number;
  asked: number;
  reasons: string[];
  notes: NoteRef[];
};

export const MAX_PLAN_TOPICS = 14;
/** An official syllabus or notes list can be longer; the schedule says which topics did not fit. */
export const MAX_OFFICIAL_TOPICS = 30;

/** Topics the student's own signals add beside an official list: only the ones that need work. */
function needsWork(t: Pick<PlanTopic, "mastery" | "mistakes">) {
  return (t.mastery !== null && t.mastery < 0.6) || t.mistakes >= 2;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Score one topic against the student's mastery, mistake log and questions. */
export function scoreTopic(base: BaseTopic, signals: StudentSignals): PlanTopic {
  const key = topicKey(base.title);
  const matches = signals.mastery.filter((m) => m.topicKey === key || relatedTopics(base.title, m.topic));
  const evidence = matches.reduce((n, m) => n + Math.max(1, m.evidence), 0);
  const mastery = matches.length
    ? round2(matches.reduce((n, m) => n + m.mastery * Math.max(1, m.evidence), 0) / evidence)
    : null;
  const slips = signals.mistakes
    .filter((m) => !m.reviewed && (relatedTopics(base.title, m.topic || m.label) || relatedTopics(base.title, m.label)))
    .sort((a, b) => b.count - a.count);
  const mistakes = slips.reduce((n, m) => n + m.count, 0);
  const asked = signals.asked.filter((a) => relatedTopics(base.title, a.topic)).reduce((n, a) => n + a.count, 0);

  const weight = round2(
    1 + (mastery === null ? 0.6 : (1 - mastery) * 1.5) + Math.min(mistakes, 4) * 0.3 + (asked >= 3 ? 0.2 : 0),
  );

  const reasons: string[] = [];
  if (mastery === null) reasons.push("Not practised yet");
  else reasons.push(`Mastery ${Math.round(mastery * 100)}%${mastery < 0.4 ? ", needs practice" : mastery < 0.75 ? ", getting there" : ", strong"}`);
  if (slips.length) reasons.push(`Repeated slip: ${slips[0].label.toLowerCase()} (×${slips[0].count})`);
  if (asked >= 3) reasons.push(`You asked Sage about it ${asked} times`);
  reasons.push(
    base.source === "syllabus" ? "On the official syllabus" : base.source === "notes" ? "From the course notes" : "From your own practice",
  );

  return {
    key,
    title: topicLabel(base.title),
    unit: base.unit?.trim() || null,
    source: base.source,
    weight,
    mastery,
    evidence: matches.reduce((n, m) => n + m.evidence, 0),
    mistakes,
    asked,
    reasons,
    notes: base.notes ?? [],
  };
}

/**
 * The plan's topics: the official syllabus if the teacher published one,
 * otherwise topics from the course notes, otherwise the student's own topics.
 * Beside an official or notes list, the student's own weak topics that the
 * list doesn't cover are added too. Weakest (highest weight) first.
 */
export function planTopics(base: BaseTopic[], signals: StudentSignals, max = MAX_PLAN_TOPICS): PlanTopic[] {
  const seen = new Set<string>();
  const official: PlanTopic[] = [];
  for (const b of base) {
    const key = topicKey(b.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    official.push(scoreTopic(b, signals));
  }

  // The student's own topics, from mastery, the mistake log and their questions.
  const own = new Map<string, BaseTopic>();
  const addOwn = (title: string) => {
    const key = topicKey(title);
    if (!key || seen.has(key) || own.has(key)) return;
    if (official.some((t) => relatedTopics(t.title, title))) return;
    if ([...own.values()].some((o) => relatedTopics(o.title, title))) return;
    own.set(key, { title, source: "yours" });
  };
  for (const m of signals.mastery) addOwn(m.topic);
  for (const m of signals.mistakes) if (!m.reviewed && m.topic) addOwn(m.topic);
  for (const a of [...signals.asked].sort((x, y) => y.count - x.count)) addOwn(a.topic);
  const ownScored = [...own.values()].map((o) => scoreTopic(o, signals));
  const extra = official.length ? ownScored.filter(needsWork) : ownScored;

  const order = new Map([...official, ...extra].map((t, i) => [t.key, i]));
  const byWeight = (a: PlanTopic, b: PlanTopic) => b.weight - a.weight || order.get(a.key)! - order.get(b.key)!;
  // An official list is kept whole (up to MAX_OFFICIAL_TOPICS); the student's extras fill the rest, at least 3 of them.
  if (official.length) {
    const kept = official.sort(byWeight).slice(0, MAX_OFFICIAL_TOPICS);
    return [...kept, ...extra.sort(byWeight).slice(0, Math.max(3, max - kept.length))].sort(byWeight);
  }
  return extra.sort(byWeight).slice(0, max);
}

// ------------------------------------------------------------- dates (India time)

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today in India time, as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function countdownLabel(days: number): string {
  if (days < 0) return "Exam done";
  if (days === 0) return "Exam today";
  if (days === 1) return "Exam tomorrow";
  return `Exam in ${days} days`;
}

// ------------------------------------------------------------- schedule

export type TaskKind = "learn" | "practice" | "revisit" | "review" | "mock" | "recap";

export type PlanTask = {
  id: string;
  kind: TaskKind;
  topic: string | null;
  key: string | null;
  minutes: number;
  title: string;
};

export type DayKind = "study" | "light" | "mock";

export type PlanDay = { date: string; kind: DayKind; tasks: PlanTask[] };

export const TASK_MINUTES = { learn: 25, practice: 20, revisit: 20, review: 15, recap: 15 } as const;

/** The longest plan we build (the date picker allows up to this far ahead). */
export const MAX_PLAN_DAYS = 90;

/** Mock test length for a daily budget: a full 45-minute test from an hour a day, otherwise a short one. */
export function mockSize(minutesPerDay: number): "short" | "full" {
  return minutesPerDay >= 60 ? "full" : "short";
}

export const MOCK_SHAPES = {
  short: { minutes: 20, choice: 3, open: 1, numeric: 2 },
  full: { minutes: 45, choice: 5, open: 2, numeric: 3 },
} as const;

type Draft = Omit<PlanTask, "id"> & { earliest?: { key: string; gap: number } };

/**
 * Fill the days from `today` to the day before the exam.
 * - The last day is a mock test plus a short review; a longer plan gets a
 *   second mock a little past halfway, and every 7th day is a light day
 *   (flashcards and the mistake log).
 * - Every topic gets a first pass, weakest first: read the notes, then
 *   practise (a strong topic only practises). If the days are too short, the
 *   lighter topics get one combined task, and only then are topics left out.
 * - Weak topics get a second visit at least 2 days after the first.
 * - Spare time goes to mixed practice on the heaviest topics and reviews.
 */
export function buildSchedule({
  topics,
  today,
  examDate,
  minutesPerDay,
  hasReview = false,
}: {
  topics: PlanTopic[];
  today: string;
  examDate: string;
  minutesPerDay: number;
  /** The student has mistakes or weak topics, so "Review before exam" has something to aim at. */
  hasReview?: boolean;
}): { days: PlanDay[]; skipped: string[] } {
  const n = Math.min(MAX_PLAN_DAYS, Math.max(1, daysBetween(today, examDate)));
  const size = mockSize(minutesPerDay);
  const mockMinutes = MOCK_SHAPES[size].minutes;
  const midMock = n >= 6 ? Math.floor(n * 0.55) : -1;

  const days: PlanDay[] = Array.from({ length: n }, (_, i) => ({
    date: addDays(today, i),
    kind: i === n - 1 || i === midMock ? "mock" : n >= 8 && i % 7 === 6 ? "light" : "study",
    tasks: [],
  }));
  // Minutes for topic work per day: none on light days, what's left beside a mock test.
  // The last day is the mock and a review only, unless it is the only day.
  const capacity = days.map((d) => (d.kind === "light" ? 0 : d.kind === "mock" ? Math.max(0, minutesPerDay - mockMinutes) : minutesPerDay));
  const studyDays = n === 1 ? [0] : days.slice(0, -1).map((_, i) => i);
  const studyCapacity = studyDays.reduce((a, i) => a + capacity[i], 0);

  // First pass, weakest first.
  const strong = (t: PlanTopic) => t.mastery !== null && t.mastery >= 0.75 && t.mistakes === 0;
  const pairs = topics.map((t) =>
    strong(t)
      ? [{ kind: "practice" as const, topic: t.title, key: t.key, minutes: TASK_MINUTES.practice, title: `Quick practice: ${t.title}` }]
      : [
          { kind: "learn" as const, topic: t.title, key: t.key, minutes: TASK_MINUTES.learn, title: `Read the notes: ${t.title}` },
          { kind: "practice" as const, topic: t.title, key: t.key, minutes: TASK_MINUTES.practice, title: `Practise ${t.title}` },
        ],
  );
  const total = () => pairs.flat().reduce((a, t) => a + t.minutes, 0);
  // Too little time: lighter topics (from the end) get one combined task.
  for (let i = pairs.length - 1; i >= 0 && total() > studyCapacity; i--) {
    if (pairs[i].length === 2) {
      const t = topics[i];
      pairs[i] = [{ kind: "practice", topic: t.title, key: t.key, minutes: TASK_MINUTES.practice, title: `Practise ${t.title} (skim the notes first)` }];
    }
  }
  const skipped: string[] = [];
  while (pairs.length && total() > studyCapacity + 5 * studyDays.length) {
    pairs.pop();
    skipped.unshift(topics[pairs.length].title);
  }
  const queue: Draft[] = pairs.flat();
  // Second visits for the topics that need work.
  let planned = total();
  for (const t of topics.slice(0, pairs.length)) {
    if (!(t.mastery === null || t.mastery < 0.6 || t.mistakes > 0)) continue;
    if (planned + TASK_MINUTES.revisit > studyCapacity) break;
    queue.push({ kind: "revisit", topic: t.title, key: t.key, minutes: TASK_MINUTES.revisit, title: `Revisit ${t.title}`, earliest: { key: t.key, gap: 2 } });
    planned += TASK_MINUTES.revisit;
  }

  // Place the queue day by day; a revisit waits until 2 days after the topic's first task.
  const firstDay = new Map<string, number>();
  for (const i of studyDays) {
    let left = capacity[i];
    for (let q = 0; q < queue.length && left > 0; ) {
      const task = queue[q];
      const ready = !task.earliest || (firstDay.has(task.earliest.key) && i >= firstDay.get(task.earliest.key)! + task.earliest.gap);
      // A task may run 5 minutes over; an empty day always takes one task.
      const fits = task.minutes <= left + 5 || (days[i].tasks.length === 0 && days[i].kind === "study");
      if (ready && fits) {
        days[i].tasks.push({ ...task, id: "" });
        if (task.key && !firstDay.has(task.key)) firstDay.set(task.key, i);
        left -= task.minutes;
        queue.splice(q, 1);
      } else {
        q++;
        // Keep the first pass in order: don't jump ahead of a first-pass task that doesn't fit.
        if (!task.earliest && !fits) break;
      }
    }
  }
  // Topics the first pass didn't reach get one combined task in any gap of 15+ minutes before spare time is filled.
  const unplaced = topics.filter((t) => queue.some((q) => !q.earliest && q.key === t.key) && !days.some((d) => d.tasks.some((x) => x.key === t.key)));
  for (const t of unplaced) {
    const i = studyDays.find((d) => capacity[d] - days[d].tasks.reduce((a, x) => a + x.minutes, 0) >= 15);
    if (i === undefined) {
      if (!skipped.includes(t.title)) skipped.push(t.title);
      continue;
    }
    days[i].tasks.push({ id: "", kind: "practice", topic: t.title, key: t.key, minutes: TASK_MINUTES.practice, title: `Practise ${t.title} (skim the notes first)` });
  }

  // Spare time: mixed practice on a topic not already on that day (heaviest first, in turn),
  // with a review or recap every third slot or when every topic is already there.
  const heavy = topics.slice(0, pairs.length);
  let turn = 0;
  let slots = 0;
  for (const i of studyDays) {
    let left = capacity[i] - days[i].tasks.reduce((a, t) => a + t.minutes, 0);
    while (left >= 15 && heavy.length) {
      const onDay = new Set(days[i].tasks.map((t) => t.key));
      const next = heavy.map((_, j) => heavy[(turn + j) % heavy.length]).find((t) => !onDay.has(t.key));
      const general = slots % 3 === 2 || !next;
      if (general && days[i].tasks.some((t) => t.kind === "review" || t.kind === "recap")) break;
      const task: Omit<PlanTask, "id"> = general
        ? hasReview
          ? { kind: "review", topic: null, key: null, minutes: TASK_MINUTES.review, title: "Review before exam: your mistake log" }
          : { kind: "recap", topic: null, key: null, minutes: TASK_MINUTES.recap, title: "Flashcards and recaps" }
        : { kind: "practice", topic: next!.title, key: next!.key, minutes: Math.min(TASK_MINUTES.practice, left), title: `Mixed practice: ${next!.title}` };
      if (!general) turn = (heavy.indexOf(next!) + 1) % heavy.length;
      days[i].tasks.push({ ...task, id: "" });
      left -= task.minutes;
      slots++;
    }
  }

  // Light days and the mock days.
  for (let i = 0; i < n; i++) {
    const d = days[i];
    if (d.kind === "light") {
      d.tasks.push({ id: "", kind: "recap", topic: null, key: null, minutes: TASK_MINUTES.recap, title: "Light day: flashcards and recaps" });
      if (hasReview) d.tasks.push({ id: "", kind: "review", topic: null, key: null, minutes: TASK_MINUTES.review, title: "Look over your mistake log" });
    }
    if (d.kind === "mock") {
      d.tasks.unshift({ id: "", kind: "mock", topic: null, key: null, minutes: mockMinutes, title: `Mock test (${mockMinutes} min)` });
      if (i === n - 1 && n > 1 && minutesPerDay - mockMinutes >= 15) {
        d.tasks.push(
          hasReview
            ? { id: "", kind: "review", topic: null, key: null, minutes: TASK_MINUTES.review, title: "Review before exam: your mistake log" }
            : { id: "", kind: "recap", topic: null, key: null, minutes: TASK_MINUTES.recap, title: "Flashcards and recaps" },
        );
      }
    }
    d.tasks.forEach((t, j) => (t.id = `${d.date}-${j + 1}`));
  }
  return { days, skipped };
}

// ------------------------------------------------------------- reading a plan

export function planProgress(days: PlanDay[], done: string[]) {
  const ticked = new Set(done);
  const tasks = days.flatMap((d) => d.tasks);
  const finished = tasks.filter((t) => ticked.has(t.id));
  return {
    done: finished.length,
    total: tasks.length,
    minutesDone: finished.reduce((a, t) => a + t.minutes, 0),
    minutesTotal: tasks.reduce((a, t) => a + t.minutes, 0),
  };
}

/** Today's day of the plan, or the next one with tasks (null once the plan is over). */
export function currentDay(days: PlanDay[], today: string): PlanDay | null {
  return days.find((d) => d.date >= today && d.tasks.length) ?? null;
}

/** Tasks from earlier days that aren't ticked yet. */
export function missedTasks(days: PlanDay[], done: string[], today: string): PlanTask[] {
  const ticked = new Set(done);
  return days.filter((d) => d.date < today).flatMap((d) => d.tasks.filter((t) => !ticked.has(t.id) && t.kind !== "recap"));
}

/** Topics for a mock test: the heaviest ones, up to `count`. */
export function mockTopics(topics: Pick<PlanTopic, "title" | "weight">[], count: number): string[] {
  return [...topics]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((t) => t.title);
}
