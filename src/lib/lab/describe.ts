import { siteName } from "./domains";
import type { LabEventType } from "./schemas";

/** Plain sentences for the teacher's event feed and seat timeline. Neutral wording only. */

export type EventDetail = { host?: string; chars?: number; seconds?: number };
export type FeedEvent = { id: number | string; seat_id: string; type: LabEventType; detail: EventDetail; at: string };

/** "Seat 14" for a plain number, otherwise the label as the lab admin typed it ("PC-14"). */
export function seatName(label: string): string {
  return /^\d+$/.test(label) ? `Seat ${label}` : label;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${m / 60} h`;
}

const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-IN");

function times(count: number): string {
  if (count === 1) return "";
  if (count === 2) return " twice";
  return ` ${count} times`;
}

/** What happened, without the seat name: "tried to open ChatGPT twice". */
export function describeAction(type: LabEventType, detail: EventDetail, count = 1): string {
  const again = times(count);
  switch (type) {
    case "joined":
      return "joined the session";
    case "rejoined":
      return `joined again${again}`;
    case "left":
      return "finished and left";
    case "stopped":
      return "stopped recording when the session ended";
    case "tab_switch":
      return detail.host ? `switched to ${detail.host}${again}` : `switched tabs${again}`;
    case "left_browser":
      return `moved to another app${again}`;
    case "returned":
      return detail.seconds != null
        ? `came back to Chrome after ${formatSeconds(detail.seconds)}`
        : "came back to Chrome";
    case "copy":
      return count > 1 ? `used copy${again}` : `used copy (${n(detail.chars)} characters)`;
    case "paste":
      return count > 1 ? `pasted${again}` : `pasted ${n(detail.chars)} characters`;
    case "blocked_site":
      return `tried to open ${detail.host ? siteName(detail.host) : "a blocked site"}${again}`;
    case "idle":
      return "has had no input for a while";
    case "active":
      return detail.seconds != null
        ? `is active again after ${formatSeconds(detail.seconds)}`
        : "is active again";
    case "heartbeat_gap":
      return detail.seconds != null
        ? `sent no signal for ${formatSeconds(detail.seconds)}`
        : "sent no signal for a while";
  }
}

/** Events the feed shows by default; the rest appear with "All activity". */
export const notableTypes: ReadonlySet<LabEventType> = new Set([
  "joined",
  "rejoined",
  "left",
  "blocked_site",
  "left_browser",
  "heartbeat_gap",
]);

export type FeedItem = {
  key: string;
  seatId: string;
  type: LabEventType;
  detail: EventDetail;
  count: number;
  /** Time of the latest event in the group. */
  at: string;
};

/** Repeats of the same thing on the same seat within this window collapse into one line. */
const GROUP_MS = 2 * 60_000;

/**
 * Newest-first feed items. Repeats on a seat ("tried to open ChatGPT", again a
 * minute later) become one line with a count, like PLAN.md's "Seat 14 tried
 * to open ChatGPT twice". Input may be in any order.
 */
export function groupFeed(events: readonly FeedEvent[]): FeedItem[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const open = new Map<string, FeedItem>();
  const items: FeedItem[] = [];
  for (const e of sorted) {
    const groupable = e.type === "blocked_site" || e.type === "tab_switch" || e.type === "copy" ||
      e.type === "paste" || e.type === "left_browser" || e.type === "rejoined";
    const host = e.type === "blocked_site" && e.detail.host ? siteName(e.detail.host) : e.detail.host ?? "";
    const k = `${e.seat_id}|${e.type}|${host}`;
    const prev = open.get(k);
    if (groupable && prev && Date.parse(e.at) - Date.parse(prev.at) <= GROUP_MS) {
      prev.count += 1;
      prev.at = e.at;
      continue;
    }
    const item: FeedItem = { key: `${e.id}`, seatId: e.seat_id, type: e.type, detail: e.detail, count: 1, at: e.at };
    items.push(item);
    open.set(k, item);
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
