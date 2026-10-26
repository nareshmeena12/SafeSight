import { z } from "zod";
import { usesBannedWords } from "@/lib/trace/summary";
import { cleanText, type TopicMapDraft } from "./topic-map";

/**
 * Suggested assignments per unit, each with a recommended AI mode. They are
 * only ideas: the teacher opens one in the normal assignment form, edits it
 * and saves it. Pure (prompts, schema, cleaning), so it is unit-tested.
 */

export const aiModes = ["learn", "assist", "exam"] as const;
export type SuggestionMode = (typeof aiModes)[number];

export const suggestionsOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      unit: z.number().int().describe("Unit number, starting at 1"),
      title: z.string(),
      instructions: z.string().describe("2–5 sentences the students read"),
      aiMode: z.enum(aiModes),
      why: z.string().describe("One sentence: why this AI mode fits"),
      outcomes: z.array(z.string()).describe("Course outcome codes it assesses, e.g. CO1"),
    }),
  ),
});

export type Suggestion = {
  id: string;
  unit: number;
  unitTitle: string;
  title: string;
  instructions: string;
  aiMode: SuggestionMode;
  why: string;
  outcomes: string[];
  status: "new" | "used" | "dismissed";
};

export const MAX_SUGGESTIONS = 12;
const PER_UNIT = 2;

export function cleanSuggestions(
  raw: z.infer<typeof suggestionsOutputSchema>,
  map: Pick<TopicMapDraft, "units" | "outcomes">,
  newId: () => string,
): Suggestion[] {
  const codes = new Set(map.outcomes.map((o) => o.code.toUpperCase()));
  const perUnit = new Map<number, number>();
  const titles = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of raw.suggestions) {
    const unit = s.unit - 1;
    if (unit < 0 || unit >= map.units.length) continue;
    const title = cleanText(s.title);
    const instructions = s.instructions.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
    const why = cleanText(s.why, 300);
    if (!title || instructions.length < 20) continue;
    if (usesBannedWords(`${title} ${instructions} ${why}`)) continue;
    if (titles.has(title.toLowerCase()) || (perUnit.get(unit) ?? 0) >= PER_UNIT) continue;
    titles.add(title.toLowerCase());
    perUnit.set(unit, (perUnit.get(unit) ?? 0) + 1);
    out.push({
      id: newId(),
      unit,
      unitTitle: map.units[unit].title,
      title,
      instructions,
      aiMode: s.aiMode,
      why: why ? `${why}.` : "",
      outcomes: [...new Set(s.outcomes.map((c) => c.replace(/\s+/g, "").toUpperCase()).filter((c) => codes.has(c)))],
      status: "new",
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Suggestions stored as jsonb; anything malformed is dropped. */
export const storedSuggestionSchema = z.object({
  id: z.string(),
  unit: z.number(),
  unitTitle: z.string(),
  title: z.string(),
  instructions: z.string(),
  aiMode: z.enum(aiModes),
  why: z.string(),
  outcomes: z.array(z.string()),
  status: z.enum(["new", "used", "dismissed"]),
});

export function readSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = storedSuggestionSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

export const SUGGEST_SYSTEM_PROMPT = `You help college teachers in India set up a course in SafeSight, an AI tutor that coaches students instead of doing their work. Suggest assignments for the course's units and recommend how the AI tutor may help on each.

AI modes:
- learn: the tutor gives hints and asks questions, never the final answer. Best for problem sets, numericals, derivations and practice where struggling is the point.
- assist: the tutor may explain fully but never writes the work. Best for essays, reports, case studies, lab write-ups and projects where explanations help but the writing must be the student's.
- exam: the tutor is off. Only for in-class tests, quizzes or anything graded under exam conditions.

Rules:
- One assignment per unit (two only for a long unit), at most ${MAX_SUGGESTIONS} in all, in unit order. Use the unit's topics.
- Make each one hard for a general chatbot to complete on its own: ask students to show their reasoning, use local or personal data (their city, their lab readings, their hostel), or add a short in-class or oral step.
- Instructions: 2–5 plain sentences addressed to students. No marks, no due dates, no answers or model solutions.
- "why": one short sentence on why the AI mode fits.
- "outcomes": the course outcome codes (from the list given) the assignment assesses; [] if none were given.
- Plain, encouraging wording. Never use the words cheating, cheater, catch, spy or AI-generated.

Return JSON only, exactly in this shape:
{"suggestions": [{"unit": 1, "title": "…", "instructions": "…", "aiMode": "learn", "why": "…", "outcomes": ["CO1"]}]}
"unit" is the unit number starting at 1; "aiMode" is one of "learn", "assist", "exam".`;

export function suggestPrompt(courseName: string, map: Pick<TopicMapDraft, "units" | "outcomes">): string {
  const units = map.units
    .map((u, i) => `Unit ${i + 1}: ${u.title}\n${u.topics.length ? u.topics.map((t) => `  - ${t}`).join("\n") : "  (no topics listed)"}`)
    .join("\n");
  const outcomes = map.outcomes.length ? map.outcomes.map((o) => `${o.code}: ${o.description}`).join("\n") : "(none given)";
  return `Course: ${courseName}\n\nUnits and topics:\n${units}\n\nCourse outcomes:\n${outcomes}`;
}

export const EXTRACT_SYSTEM_PROMPT = `You read a college course syllabus (often from an Indian university) and return its structure as JSON for the teacher to review.

Return:
- courseName: the course title as written (not the programme or university name); "" if not stated.
- courseCode: the course code (e.g. ME201, 18ME32); "" if not stated.
- units: the units / modules in order. title = the unit's name without "Unit I", marks or teaching hours (if a unit has no name, use its main topic). topics = the short topics it lists (2–8 words each), in order. Split long comma-separated lists into separate topics. Keep the syllabus's own technical wording. At most 20 units and 30 topics per unit.
- outcomes: the course outcomes (COs) exactly as the syllabus states them, with their codes (CO1, CO2, …). If the syllabus states none, return []. Never invent outcomes.

Leave out textbooks, reference books, marks distribution, lab equipment lists, teaching hours and university boilerplate. Never invent units or topics that are not in the text.

Return JSON only, exactly in this shape:
{"courseName": "…", "courseCode": "…", "units": [{"title": "…", "topics": ["…", "…"]}], "outcomes": [{"code": "CO1", "description": "…"}]}`;

export function extractPrompt(text: string): string {
  return `Syllabus text:\n"""\n${text}\n"""`;
}
