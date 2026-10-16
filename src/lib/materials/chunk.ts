/**
 * Splits extracted PDF pages into search chunks of about 500 tokens (~2,000
 * characters of English). A chunk never crosses a page, so every chunk has
 * exactly one page number to cite.
 */

export type Chunk = { page: number; content: string };

export const CHUNK_MAX_CHARS = 2000;
const CHUNK_MIN_CHARS = 40;

/** Collapse PDF whitespace while keeping paragraph breaks. */
export function cleanPageText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/(\w)-\n(\w)/g, "$1$2") // re-join words hyphenated across lines
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Pieces no longer than `max`: by sentence, then by word, then hard cut. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      for (const word of s.split(/\s+/)) {
        if (word.length > max) {
          for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
        } else if ((buf + " " + word).trim().length > max) {
          out.push(buf.trim());
          buf = word;
        } else {
          buf = `${buf} ${word}`;
        }
      }
      continue;
    }
    if ((buf + s).trim().length > max) {
      if (buf.trim()) out.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function chunkPages(pages: string[], max = CHUNK_MAX_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((raw, index) => {
    const page = index + 1;
    const paragraphs = cleanPageText(raw)
      .split("\n\n")
      .flatMap((p) => splitLong(p, max));
    let buf = "";
    for (const p of paragraphs) {
      if (buf && buf.length + 2 + p.length > max) {
        chunks.push({ page, content: buf });
        buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) chunks.push({ page, content: buf });
  });
  return chunks.filter((c) => c.content.replace(/\W/g, "").length >= CHUNK_MIN_CHARS / 2 && c.content.length >= CHUNK_MIN_CHARS);
}
