/**
 * Anonymising student quotes for the pre-lecture brief (S19). Pure.
 *
 * Quotes are scrubbed before the model reads them and before a teacher sees
 * them: names on the course roster (and the teacher's), email addresses,
 * links, Indian mobile numbers and roll numbers are replaced, and the text is
 * cut to a short excerpt.
 */

export const MAX_QUOTE_CHARS = 240;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const MOBILE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g;
// ME23B001, CS22BTECH11042, 21ME10045: letters and digits mixed, 6+ characters.
const ROLL = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,16}\b/gi;
// A value with its unit is not a roll number: keep "1500rpm", "300kPa", "2nd". Long
// formulas (C6H12O6) look like roll numbers and are hidden too: privacy wins.
const LOOKS_LIKE_UNIT = /^\d+[a-z]{0,4}$/i;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The name parts worth hiding: every word of each full name, 3+ letters. */
export function nameTokens(fullNames: string[]): string[] {
  const tokens = new Set<string>();
  for (const name of fullNames) {
    for (const part of name.split(/[\s.,'-]+/)) {
      if (part.length >= 3) tokens.add(part.toLowerCase());
    }
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

/** Replaces names, contact details and roll numbers, collapses spacing and cuts to an excerpt. */
export function scrubText(text: string, names: string[], max = MAX_QUOTE_CHARS): string {
  let out = text.replace(EMAIL, "[email]").replace(LINK, "[link]").replace(MOBILE, "[number]");
  out = out.replace(ROLL, (m) => (LOOKS_LIKE_UNIT.test(m) ? m : "[roll no.]"));
  if (names.length > 0) {
    const pattern = new RegExp(`(?<![\\p{L}])(?:${names.map(escapeRegExp).join("|")})(?![\\p{L}])`, "giu");
    out = out.replace(pattern, "[name]");
  }
  // "my name is [name] [name]" → one marker.
  out = out.replace(/\[name\](?:\s+\[name\])+/g, "[name]");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length <= max) return out;
  const cut = out.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}
