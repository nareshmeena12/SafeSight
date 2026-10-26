import { z } from "zod";
import { usesBannedWords } from "@/lib/trace/summary";

/**
 * "Suggest a mapping" (S24): the model proposes CO–PO levels with a one-line
 * reason each, from the statements alone. The teacher reviews the grid and
 * saves; nothing is stored here. Pure: prompt, schema and cleaning.
 */

export const SUGGEST_SYSTEM_PROMPT = `You help an Indian engineering college teacher fill in the CO–PO mapping matrix of one course for NBA / NAAC accreditation.

For each course outcome (CO), decide which programme outcomes (PO / PSO) it supports and how strongly:
- 3 = high: the CO directly and substantially develops the PO (e.g. "apply the laws of thermodynamics to solve problems" → PO1 engineering knowledge, PO2 problem analysis).
- 2 = medium: the CO clearly contributes, but it is not its main purpose.
- 1 = low: a small, real contribution.
- Leave a pair out when the link is weak or would need guessing. Do not map ethics, team work, communication, project management or life-long learning unless the CO's words call for it.
Most COs map to 2–5 outcomes. Be consistent: similar COs get similar levels.

For every pair you map, give a short reason (at most 20 words) that names what in the CO supports the PO.

Reply with JSON only, exactly this shape:
{"mappings": [{"co": "CO1", "po": "PO1", "level": 3, "why": "Applies first-law analysis to closed systems"}]}
Use the codes exactly as given.`;

export function suggestPrompt(
  course: { name: string; code: string },
  outcomes: { code: string; description: string }[],
  programOutcomes: { code: string; title: string; description: string }[],
) {
  return [
    `Course: ${course.code ? `${course.code} ` : ""}${course.name}`,
    "",
    "Course outcomes:",
    ...outcomes.map((o) => `${o.code}: ${o.description}`),
    "",
    "Programme outcomes:",
    ...programOutcomes.map((p) => `${p.code}${p.title ? ` (${p.title})` : ""}: ${p.description}`),
  ].join("\n");
}

export const suggestionOutputSchema = z.object({
  mappings: z
    .array(
      z.object({
        co: z.string(),
        po: z.string(),
        level: z.coerce.number(),
        why: z.string().optional().default(""),
      }),
    )
    .max(400),
});

export type SuggestedCell = { outcomeId: string; programOutcomeId: string; level: 1 | 2 | 3; why: string };

const codeKey = (code: string) => code.replace(/[\s.\-:]/g, "").toUpperCase();

/** Known codes only, levels 1–3, one entry per pair, reasons trimmed and checked. */
export function cleanSuggestions(
  raw: z.infer<typeof suggestionOutputSchema>,
  outcomes: { id: string; code: string }[],
  programOutcomes: { id: string; code: string }[],
): SuggestedCell[] {
  const co = new Map(outcomes.map((o) => [codeKey(o.code), o.id]));
  const po = new Map(programOutcomes.map((p) => [codeKey(p.code), p.id]));
  const out = new Map<string, SuggestedCell>();
  for (const m of raw.mappings) {
    const outcomeId = co.get(codeKey(m.co));
    const programOutcomeId = po.get(codeKey(m.po));
    const level = Math.round(m.level);
    if (!outcomeId || !programOutcomeId || level < 1 || level > 3) continue;
    const key = `${outcomeId}:${programOutcomeId}`;
    if (out.has(key)) continue;
    let why = m.why.replace(/\s+/g, " ").trim();
    if (why.length > 200) why = `${why.slice(0, 197).trimEnd()}…`;
    if (usesBannedWords(why)) why = "";
    out.set(key, { outcomeId, programOutcomeId, level: level as 1 | 2 | 3, why });
  }
  return [...out.values()];
}
