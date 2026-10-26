import { visibleLength as visible } from "./text";

/** Attribute the editor's paste mark renders with (see components/trace/paste-mark.ts). */
export const PASTE_ATTR = "data-trace-paste";

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return entities[body.toLowerCase()] ?? m;
  });
}


/**
 * Counts visible (non-whitespace) characters in editor HTML, and how many of
 * them sit inside a paste mark. Works on the server without a DOM; the input
 * is Tiptap output, so a small tag scanner is enough.
 */
export function measureHtml(html: string): { chars: number; pastedChars: number } {
  let chars = 0;
  let pastedChars = 0;
  // Stack of open <span>s: true when that span is a paste mark.
  const spans: boolean[] = [];
  let pasteDepth = 0;

  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let last = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const n = visible(decodeEntities(html.slice(last, m.index)));
    chars += n;
    if (pasteDepth > 0) pastedChars += n;
    last = tag.lastIndex;

    const [, closing, name, attrs] = m;
    if (name.toLowerCase() !== "span" || attrs.trimEnd().endsWith("/")) continue;
    if (closing) {
      if (spans.pop()) pasteDepth--;
    } else {
      const isPaste = attrs.includes(PASTE_ATTR);
      spans.push(isPaste);
      if (isPaste) pasteDepth++;
    }
  }
  const n = visible(decodeEntities(html.slice(last)));
  chars += n;
  if (pasteDepth > 0) pastedChars += n;

  return { chars, pastedChars };
}
