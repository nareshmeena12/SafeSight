/**
 * Links uploaded notes to the topics of a course's topic map: for each topic,
 * the notes (and pages) where its words actually appear. Words are weighted
 * by how rare they are in the course's notes, so "entropy change" is matched
 * on "entropy", not on "change". Deterministic and free (no model call);
 * pure, so it is unit-tested.
 */

export type NoteChunk = { materialId: string; page: number; content: string };
export type TopicRef = { id: string; title: string };
export type TopicLink = { topicId: string; materialId: string; pages: number[]; score: number };

const STOP = new Set(
  (
    "a an the and or of to in on at by for with from as is are be its this that how why what into about vs versus using use " +
    "introduction basic basics concept overview various type related problem numerical example simple general study " +
    "unit module part chapter method application their other its also"
  ).split(" "),
);

/** Light English stemming: processes → process, properties → property, cycles → cycle. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .map(stem);
}

function contentWords(title: string): string[] {
  return [...new Set(words(title).filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)))];
}

const MAX_PAGES = 5;
const MAX_NOTES_PER_TOPIC = 3;
const MIN_COVERAGE = 0.75;
const MIN_SCORE = 0.4;

export function linkTopicsToNotes(topics: TopicRef[], chunks: NoteChunk[]): TopicLink[] {
  if (!topics.length || !chunks.length) return [];
  const docs = chunks.map((c) => {
    const tokens = words(c.content);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { chunk: c, counts, joined: ` ${tokens.join(" ")} ` };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.counts.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const n = docs.length;
  const idf = (w: string) => Math.log((n + 1) / ((df.get(w) ?? 0) + 0.5));

  const links: TopicLink[] = [];
  for (const topic of topics) {
    const terms = contentWords(topic.title);
    if (!terms.length) continue;
    const total = terms.reduce((s, w) => s + Math.max(idf(w), 0.05), 0);
    const phrase = terms.length > 1 ? ` ${words(topic.title).join(" ")} ` : null;

    const perMaterial = new Map<string, { best: number; hits: { page: number; score: number }[] }>();
    for (const d of docs) {
      let matched = 0;
      let occurrences = 0;
      for (const w of terms) {
        const c = d.counts.get(w) ?? 0;
        if (c > 0) {
          matched += Math.max(idf(w), 0.05);
          occurrences += c;
        }
      }
      const coverage = matched / total;
      const hasPhrase = phrase !== null && d.joined.includes(phrase);
      if (coverage < MIN_COVERAGE || (!hasPhrase && occurrences < 2)) continue;
      const score = coverage * Math.min(1, occurrences / 4) + (hasPhrase ? 0.5 : 0);
      const entry = perMaterial.get(d.chunk.materialId) ?? { best: 0, hits: [] };
      entry.best = Math.max(entry.best, score);
      entry.hits.push({ page: d.chunk.page, score });
      perMaterial.set(d.chunk.materialId, entry);
    }

    const ranked = [...perMaterial.entries()]
      .map(([materialId, { best, hits }]) => {
        const pages = [...new Map(hits.sort((a, b) => b.score - a.score).map((h) => [h.page, h])).keys()].slice(0, MAX_PAGES);
        return { topicId: topic.id, materialId, pages: pages.sort((a, b) => a - b), score: best + 0.1 * Math.min(3, hits.length - 1) };
      })
      .filter((l) => l.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NOTES_PER_TOPIC);
    links.push(...ranked.map((l) => ({ ...l, score: Math.round(l.score * 1000) / 1000 })));
  }
  return links;
}
