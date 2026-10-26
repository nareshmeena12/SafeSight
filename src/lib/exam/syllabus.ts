import { topicKey } from "@/lib/learning/topics";

/**
 * The official syllabus a teacher may publish for exam prep: one topic per
 * line, with an optional unit. Pure, so the teacher form and the server
 * action read it the same way.
 *
 *   Unit 1:                         → a heading: the lines below are in Unit 1
 *   First law for closed systems     → topic in the current unit
 *   Unit 2 — Entropy change          → topic "Entropy change", and Unit 2 from here on
 *   - Polytropic processes           → bullets and numbering are dropped
 */

export type SyllabusTopic = { title: string; unit: string | null };

export const MAX_SYLLABUS_TOPICS = 40;
const MAX_TITLE = 120;

const unitPattern = /^((?:unit|module|chapter|part)\s*[-\w.]{1,6}|u\s*\d{1,2})\s*(?:[:\-–—.)]\s*(.*))?$/i;

export function parseSyllabus(text: string): { topics: SyllabusTopic[]; error: string | null } {
  const topics: SyllabusTopic[] = [];
  const seen = new Set<string>();
  let unit: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const u = line.match(unitPattern);
    let title = line;
    if (u) {
      const label = u[1].replace(/\s+/g, " ").replace(/^u\s*(\d)/i, "Unit $1");
      unit = label[0].toUpperCase() + label.slice(1);
      // "Unit 2: Entropy change" sets the unit and is a topic; "Unit 2:" alone is only a heading.
      title = (u[2] ?? "").trim();
      if (!title) continue;
    }
    if (title.length > MAX_TITLE) return { topics: [], error: `"${title.slice(0, 40)}…" is long — keep each topic under ${MAX_TITLE} characters.` };
    const key = topicKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    topics.push({ title, unit });
  }
  if (topics.length > MAX_SYLLABUS_TOPICS) return { topics: [], error: `That's ${topics.length} topics — keep it to ${MAX_SYLLABUS_TOPICS} or fewer.` };
  return { topics, error: null };
}

/** The textarea's text for saved topics (round-trips through parseSyllabus; topics without a unit come first). */
export function syllabusText(topics: SyllabusTopic[]): string {
  const lines = topics.filter((t) => !t.unit).map((t) => t.title);
  let unit: string | null = null;
  for (const t of topics.filter((t) => t.unit)) {
    if (t.unit !== unit) lines.push(`${t.unit}:`);
    unit = t.unit;
    lines.push(t.title);
  }
  return lines.join("\n");
}
