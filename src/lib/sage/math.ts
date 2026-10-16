/**
 * Models often write maths as \( … \) and \[ … \]; remark-math only knows
 * $ … $ and $$ … $$. Convert outside code so KaTeX can render it.
 */
export function normalizeMath(markdown: string): string {
  // Split into code (fenced or inline) and prose; only touch prose.
  const parts = markdown.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `\n$$\n${m.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
    })
    .join("");
}
