/** Date and time formats for lab pages (India time). */

const tz = "Asia/Kolkata";

export const dayTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: tz,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const timeOnly = new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const timeSeconds = new Intl.DateTimeFormat("en-IN", {
  timeZone: tz,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "123 456" — easier to read off a projector. */
export function spacedCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
