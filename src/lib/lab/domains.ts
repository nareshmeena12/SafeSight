/**
 * Sites blocked during every lab session (PLAN.md §4): the AI chat tools
 * students reach for most. Teachers add their own on top. A domain blocks
 * itself and every subdomain (`openai.com` also blocks `chat.openai.com`).
 */
export const AI_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "oaiusercontent.com",
  "gemini.google.com",
  "bard.google.com",
  "aistudio.google.com",
  "notebooklm.google.com",
  "claude.ai",
  "copilot.microsoft.com",
  "copilot.cloud.microsoft",
  "deepseek.com",
  "perplexity.ai",
  "poe.com",
  "you.com",
  "meta.ai",
  "grok.com",
  "chat.mistral.ai",
  "character.ai",
  "phind.com",
  "blackbox.ai",
  "chat.qwen.ai",
  "kimi.com",
] as const;

/** Friendly names for the feed: "tried to open ChatGPT". */
const names: [string, string][] = [
  ["chatgpt.com", "ChatGPT"],
  ["openai.com", "ChatGPT"],
  ["gemini.google.com", "Gemini"],
  ["bard.google.com", "Gemini"],
  ["aistudio.google.com", "Google AI Studio"],
  ["claude.ai", "Claude"],
  ["copilot.microsoft.com", "Copilot"],
  ["copilot.cloud.microsoft", "Copilot"],
  ["deepseek.com", "DeepSeek"],
  ["perplexity.ai", "Perplexity"],
  ["meta.ai", "Meta AI"],
  ["grok.com", "Grok"],
];

const hostPattern = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/**
 * Reads what a teacher typed ("https://www.Example.com/path", "example.com")
 * as a bare lowercase host without `www.`. Returns null if it isn't one.
 */
export function normalizeDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split(/[/?#]/)[0]!;
  v = v.replace(/:\d+$/, "").replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
  return hostPattern.test(v) ? v : null;
}

/** Splits a textarea (lines, commas or spaces) into valid, unique hosts. */
export function parseBlocklist(text: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,]+/)) {
    if (!part) continue;
    const d = normalizeDomain(part);
    if (!d) invalid.push(part);
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}

/** The full list the extension enforces: the AI list plus the teacher's. */
export function fullBlocklist(extra: readonly string[]): string[] {
  return [...new Set([...AI_DOMAINS, ...extra])];
}

/** True if `host` is a listed domain or a subdomain of one. */
export function isBlockedHost(host: string, list: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return list.some((d) => h === d || h.endsWith(`.${d}`));
}

/** "ChatGPT" for chatgpt.com, otherwise the host itself. */
export function siteName(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const [domain, name] of names) if (h === domain || h.endsWith(`.${domain}`)) return name;
  return h;
}
