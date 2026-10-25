/**
 * Topic labels come from the classifier ("first law sign convention"), from
 * a practice button or from the mistake log. One key per topic, so the same
 * idea written two ways lands on one row of mastery.
 */

/** Lower case, no punctuation, single spaces, at most 120 characters. */
export function topicKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

/** A tidy label for display: trimmed, single spaces, first letter upper case. */
export function topicLabel(label: string): string {
  const t = label.replace(/\s+/g, " ").trim().slice(0, 120);
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const STOP = new Set(
  "a an the and or of to in on at by for with from as is are be its this that how why what into about vs versus using".split(" "),
);

function contentWords(key: string) {
  return new Set(key.split(" ").filter((w) => w.length >= 3 && !STOP.has(w)));
}

/**
 * Two topic labels are about the same idea: same key, or the shorter one's
 * content words are (nearly) all in the longer one. "entropy" ~ "entropy
 * change"; "entropy change" ≁ "entropy as disorder".
 */
export function relatedTopics(a: string, b: string): boolean {
  const ka = topicKey(a);
  const kb = topicKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const wa = contentWords(ka);
  const wb = contentWords(kb);
  if (!wa.size || !wb.size) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared >= 1 && shared / Math.min(wa.size, wb.size) >= 0.66;
}
