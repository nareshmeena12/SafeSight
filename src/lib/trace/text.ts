/** Visible (non-whitespace) characters: the unit Trace uses for every size. */
export const visibleLength = (text: string) => text.replace(/\s/g, "").length;

export function wordCount(text: string) {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}
