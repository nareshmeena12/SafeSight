import { z } from "zod";
import { topicKey } from "@/lib/learning/topics";

/**
 * The topic map: course name and code, units with their topics, and course
 * outcomes (CO1, CO2, …). Read from a syllabus by the model, then edited and
 * saved by the teacher. Pure helpers shared by the editor and the server.
 */

export const LIMITS = { units: 20, topicsPerUnit: 30, outcomes: 20, title: 200, outcome: 600 } as const;

export type TopicMapDraft = {
  courseName: string;
  courseCode: string;
  units: { title: string; topics: string[] }[];
  outcomes: { code: string; description: string }[];
};

/** What the model returns (lenient; `cleanTopicMap` tidies and caps it). */
export const extractionSchema = z.object({
  courseName: z.string().describe("The course title as written, or empty"),
  courseCode: z.string().describe("The course code (e.g. ME201), or empty"),
  units: z
    .array(
      z.object({
        title: z.string().describe("Unit or module title, without marks or hours"),
        topics: z.array(z.string()).describe("Short topic names in this unit, in syllabus order"),
      }),
    )
    .describe("Units / modules in order"),
  outcomes: z
    .array(z.object({ code: z.string().describe("CO1, CO2, …"), description: z.string() }))
    .describe("Course outcomes stated in the syllabus; empty if none are stated"),
});

/** The saved map as the editor receives it (ids keep note links across edits). */
export type SavedTopicMap = {
  units: { id: string; title: string; topics: { id: string; title: string }[] }[];
  outcomes: { id: string; code: string; description: string }[];
};

const LEADING_MARKER = /^(?:[-–—•*·▪●○◦>]+|\(?(?:\d{1,2}|[ivxlc]{1,5}|[a-z])[.)\]:]|\d{1,2}(?:\.\d{1,2})+\.?)\s+/i;

/** One line of syllabus text: single spaces, no bullet or numbering, no trailing separators, not shouting. */
export function cleanText(value: string, max: number = LIMITS.title): string {
  let t = value.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3 && LEADING_MARKER.test(t); i++) t = t.replace(LEADING_MARKER, "").trim();
  t = t.replace(/[\s.,;:–—-]+$/, "").trim();
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length > 4 && letters === letters.toUpperCase()) {
    // "BASIC CONCEPTS AND FIRST LAW" → "Basic concepts and first law" (keeps short acronyms like "SI").
    t = t
      .toLowerCase()
      .replace(/\b([a-z]{1,3})\b/g, (w) => (/^(si|ic|ac|dc|pv|ts|cop)$/.test(w) ? w.toUpperCase() : w));
    t = t[0].toUpperCase() + t.slice(1);
  }
  return t.slice(0, max).trim();
}

/** Topics on separate lines; an over-long comma list is split into its parts. Duplicates (same key) dropped. */
export function cleanTopics(topics: string[]): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  for (const raw of topics) {
    const parts = raw.length > 120 && /[,;]/.test(raw) ? raw.split(/[,;]/) : [raw];
    for (const part of parts) {
      const t = cleanText(part);
      const key = topicKey(t);
      if (!t || !key || keys.has(key)) continue;
      keys.add(key);
      out.push(t);
      if (out.length >= LIMITS.topicsPerUnit) return out;
    }
  }
  return out;
}

/** "CO 1", "co-2", "CO.3" → "CO1". Anything else is kept as written (max 16 characters). */
export function normaliseOutcomeCode(code: string, index: number): string {
  const m = code.trim().match(/^c\s*o\s*[-.:]?\s*(\d{1,2})$/i);
  if (m) return `CO${Number(m[1])}`;
  const t = code.replace(/\s+/g, "").slice(0, 16);
  return t || `CO${index + 1}`;
}

export function cleanOutcomes(outcomes: { code: string; description: string }[]): TopicMapDraft["outcomes"] {
  const out: TopicMapDraft["outcomes"] = [];
  const codes = new Set<string>();
  for (const o of outcomes) {
    const description = cleanText(o.description, LIMITS.outcome);
    if (!description) continue;
    let code = normaliseOutcomeCode(o.code, out.length);
    if (codes.has(code)) code = `CO${out.length + 1}`;
    if (codes.has(code)) continue;
    codes.add(code);
    out.push({ code, description });
    if (out.length >= LIMITS.outcomes) break;
  }
  return out;
}

export function cleanTopicMap(raw: z.infer<typeof extractionSchema>): TopicMapDraft {
  const units: TopicMapDraft["units"] = [];
  for (const u of raw.units) {
    const topics = cleanTopics(u.topics);
    const title = cleanText(u.title) || (topics.length ? `Unit ${units.length + 1}` : "");
    if (!title) continue;
    units.push({ title, topics });
    if (units.length >= LIMITS.units) break;
  }
  return {
    courseName: cleanText(raw.courseName),
    courseCode: raw.courseCode.replace(/\s+/g, "").toUpperCase().slice(0, 32),
    units,
    outcomes: cleanOutcomes(raw.outcomes),
  };
}

// ---------------------------------------------------------------- editor text

/** One topic per line. */
export function textToTopics(text: string): string[] {
  return cleanTopics(text.split("\n"));
}

/** "CO1: Apply the first law …" per line; a line without a code gets the next number. */
export function textToOutcomes(text: string): TopicMapDraft["outcomes"] {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(c\s*o\s*[-.]?\s*\d{1,2})\s*[:.)–—-]\s*(.+)$/i);
      return m ? { code: m[1], description: m[2] } : { code: "", description: line };
    });
  return cleanOutcomes(rows);
}

export function outcomesToText(outcomes: { code: string; description: string }[]): string {
  return outcomes.map((o) => `${o.code}: ${o.description}`).join("\n");
}

// ---------------------------------------------------------------- saving

export const saveTopicMapSchema = z.object({
  courseId: z.uuid(),
  courseName: z.string().trim().min(2, "Give the course a name.").max(200, "Keep the name under 200 characters."),
  courseCode: z
    .string()
    .trim()
    .max(32, "Keep the code under 32 characters.")
    .transform((v) => v.replace(/\s+/g, "").toUpperCase()),
  units: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Every unit needs a title.").max(LIMITS.title),
        topics: z.array(z.string().trim().min(1).max(LIMITS.title)).max(LIMITS.topicsPerUnit, `Keep each unit to ${LIMITS.topicsPerUnit} topics.`),
      }),
    )
    .max(LIMITS.units, `Keep the map to ${LIMITS.units} units.`),
  outcomes: z
    .array(z.object({ code: z.string().trim().min(1).max(16), description: z.string().trim().min(1).max(LIMITS.outcome) }))
    .max(LIMITS.outcomes, `Keep it to ${LIMITS.outcomes} outcomes.`),
});

export type TopicMapPayload = {
  units: { id?: string; title: string; topics: { id?: string; title: string }[] }[];
  outcomes: { id?: string; code: string; description: string }[];
};

/**
 * Gives the edited map the ids of the saved one where they match, so a topic
 * keeps its linked notes when the teacher renames its unit or moves it.
 * Topics match by key anywhere in the course; units by key, then by position;
 * outcomes by code.
 */
export function withSavedIds(next: Pick<TopicMapDraft, "units" | "outcomes">, saved: SavedTopicMap): TopicMapPayload {
  const topicIds = new Map<string, string>();
  for (const u of saved.units) for (const t of u.topics) if (!topicIds.has(topicKey(t.title))) topicIds.set(topicKey(t.title), t.id);
  const unitByKey = new Map(saved.units.map((u) => [topicKey(u.title), u.id]));
  const usedUnits = new Set<string>();

  const units = next.units.map((u) => {
    const byKey = unitByKey.get(topicKey(u.title));
    return { u, id: byKey && !usedUnits.has(byKey) ? (usedUnits.add(byKey), byKey) : undefined };
  });
  // Renamed units keep the id of the saved unit in the same place.
  units.forEach((entry, i) => {
    const same = saved.units[i]?.id;
    if (!entry.id && same && !usedUnits.has(same)) {
      usedUnits.add(same);
      entry.id = same;
    }
  });

  const usedTopics = new Set<string>();
  const outcomeIds = new Map(saved.outcomes.map((o) => [o.code.toUpperCase(), o.id]));
  return {
    units: units.map(({ u, id }) => ({
      id,
      title: u.title,
      topics: u.topics.map((title) => {
        const tid = topicIds.get(topicKey(title));
        if (tid && !usedTopics.has(tid)) {
          usedTopics.add(tid);
          return { id: tid, title };
        }
        return { title };
      }),
    })),
    outcomes: next.outcomes.map((o) => ({ id: outcomeIds.get(o.code.toUpperCase()), ...o })),
  };
}
