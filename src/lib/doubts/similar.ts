/**
 * S21: groups open doubts that ask about the same thing, so a teacher can
 * answer them once as a class announcement. Pure word overlap (no model):
 * cheap, predictable and explainable ("3 students asked about polytropic work").
 */

export type DoubtText = { id: string; studentId: string; assignmentId: string | null; question: string; stuckOn: string };
export type DoubtGroup = { ids: string[]; students: number; words: string[] };

/** Similarity at which two doubts count as the same question. */
export const SIMILAR_THRESHOLD = 0.3;
/** A group needs this many different students before it's offered as an announcement. */
export const MIN_GROUP_STUDENTS = 2;

const STOP = new Set(
  "a an the and or but have has had having if of to in on at by for with from as is are was were be been being it its this that these those i me my we our you your he she they them how what why when where which who whom do does did doing done can could should would will shall may might must not no yes so than then there here into onto over under about after before again also just only very more most much many some any each every all both few other such own same too up down out off between because while until please sir mam maam help stuck understand question doubt get got find know want need trying tried try im ive dont cant whats".split(
    " ",
  ),
);

/** processes → process, boxes → box, values → value, class stays class. */
function singular(w: string) {
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Content words of a doubt: lower case, no stop words, crude singular, numbers kept. */
export function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(singular);
  return [...new Set(words)];
}

/** Overlap of two word sets (Jaccard), with a small lift when both are about the same assignment. */
export function similarity(a: DoubtText, b: DoubtText): number {
  const wa = new Set(keywords(`${a.question} ${a.stuckOn}`));
  const wb = new Set(keywords(`${b.question} ${b.stuckOn}`));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const jaccard = shared / (wa.size + wb.size - shared);
  const sameAssignment = a.assignmentId && a.assignmentId === b.assignmentId ? 0.1 : 0;
  return Math.min(1, shared ? jaccard + sameAssignment : 0);
}

/**
 * Single-link groups of similar doubts, biggest first. Only groups with at
 * least MIN_GROUP_STUDENTS different students are returned; `words` are the
 * words most of the group shares (for a suggested title).
 */
export function groupSimilarDoubts(doubts: readonly DoubtText[], threshold = SIMILAR_THRESHOLD): DoubtGroup[] {
  const parent = doubts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < doubts.length; i++) {
    for (let j = i + 1; j < doubts.length; j++) {
      if (similarity(doubts[i], doubts[j]) >= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, DoubtText[]>();
  doubts.forEach((d, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), d]));

  return [...groups.values()]
    .map((members) => {
      const students = new Set(members.map((m) => m.studentId)).size;
      const counts = new Map<string, number>();
      for (const m of members) for (const w of keywords(`${m.question} ${m.stuckOn}`)) counts.set(w, (counts.get(w) ?? 0) + 1);
      const words = [...counts.entries()]
        .filter(([w, n]) => n >= Math.max(2, Math.ceil(members.length / 2)) && !/^\d/.test(w))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([w]) => w);
      return { ids: members.map((m) => m.id), students, words };
    })
    .filter((g) => g.students >= MIN_GROUP_STUDENTS)
    .sort((a, b) => b.students - a.students || b.ids.length - a.ids.length);
}

/** A suggested announcement title from the shared words. */
export function suggestedTitle(group: Pick<DoubtGroup, "words">): string {
  if (!group.words.length) return "Answer to a question several of you asked";
  return `About ${group.words.slice(0, 3).join(", ")}: a question several of you asked`;
}
