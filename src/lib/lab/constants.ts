/** Timing rules shared by the API, the teacher grid and the report. */

/** The extension sends a heartbeat this often. */
export const HEARTBEAT_MS = 10_000;
/** A seat with no heartbeat for this long is shown as silent (PLAN.md §4). */
export const SILENT_AFTER_MS = 30_000;
/** Students may join this long before the start time (to settle in). */
export const JOIN_EARLY_MS = 15 * 60_000;
/** Events up to this long after the end are still accepted (last batch). */
export const LATE_EVENTS_MS = 2 * 60_000;
/** The extension reports idle after this many seconds without input. */
export const IDLE_AFTER_SECONDS = 60;
