import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { parseBlocklist } from "./domains";

/** zod schemas for every Live Lab Mode input (teacher forms and the extension API). */

export type LabEventType = Database["public"]["Enums"]["lab_event_type"];

/** Events the extension may send. `joined`, `rejoined`, `stopped` and `heartbeat_gap` are written by the server. */
export const clientEventTypes = [
  "tab_switch",
  "left_browser",
  "returned",
  "copy",
  "paste",
  "blocked_site",
  "idle",
  "active",
] as const satisfies readonly LabEventType[];

/** Roll numbers are compared upper case without spaces ("me 23 b001" → "ME23B001"). */
export function normalizeRollNumber(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

export const rollNumberSchema = z
  .string()
  .transform(normalizeRollNumber)
  .pipe(
    z
      .string()
      .min(1, "Enter your roll number.")
      .max(32, "That roll number is too long.")
      .regex(/^[A-Z0-9/-]+$/, "Use letters, numbers, / or - only."),
  );

export const sessionCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "The session code is 6 digits."));

export const joinSchema = z.object({
  code: sessionCodeSchema,
  rollNumber: rollNumberSchema,
  seatLabel: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => v || undefined),
  version: z.string().max(20).optional(),
});

export const eventDetailSchema = z
  .object({
    host: z.string().max(253).optional(),
    chars: z.number().int().min(0).max(10_000_000).optional(),
    seconds: z.number().int().min(0).max(86_400).optional(),
  })
  .strict();

export const clientEventSchema = z.object({
  type: z.enum(clientEventTypes),
  detail: eventDetailSchema.optional().default({}),
  /** Epoch milliseconds on the lab PC. The server clamps it to the seat's lifetime. */
  at: z.number().int().positive(),
});
export type ClientEvent = z.infer<typeof clientEventSchema>;

export const heartbeatSchema = z.object({
  events: z.array(clientEventSchema).max(500).default([]),
  /** The student pressed "I've finished" in the extension. */
  leave: z.boolean().optional(),
});

// ---------------------------------------------------------------- teacher forms

/** `<input type="datetime-local">` has no zone; our colleges are in India. */
const istDateTime = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform((v, ctx) => {
      const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}+05:30`);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "Pick a valid date and time." });
        return z.NEVER;
      }
      return parsed;
    });

export const blocklistField = z
  .string()
  .max(5_000, "Keep the list shorter.")
  .optional()
  .transform((v, ctx) => {
    const { domains, invalid } = parseBlocklist(v ?? "");
    if (invalid.length) {
      ctx.addIssue({
        code: "custom",
        message: `These don't look like websites: ${invalid.slice(0, 3).join(", ")}`,
      });
      return z.NEVER;
    }
    if (domains.length > 100) {
      ctx.addIssue({ code: "custom", message: "Add at most 100 extra sites." });
      return z.NEVER;
    }
    return domains;
  });

export const labSessionSchema = z
  .object({
    courseId: z.uuid("Choose a course."),
    title: z
      .string()
      .trim()
      .min(2, "Give the session a title.")
      .max(200, "Keep the title under 200 characters."),
    room: z.string().trim().max(80, "Keep the room under 80 characters.").optional().transform((v) => v ?? ""),
    startsAt: istDateTime("Choose when the session starts."),
    durationMinutes: z.coerce
      .number("Choose how long it runs.")
      .int()
      .min(10, "A session runs at least 10 minutes.")
      .max(720, "A session runs at most 12 hours."),
    blocklist: blocklistField,
  })
  .transform(({ startsAt, durationMinutes, ...rest }) => ({
    ...rest,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
  }));

export const labSessionIdSchema = z.object({ sessionId: z.uuid() });

export const extendSchema = z.object({
  sessionId: z.uuid(),
  minutes: z.coerce.number().int().min(5).max(120),
});

export const blocklistSchema = z.object({ sessionId: z.uuid(), blocklist: blocklistField });

export const rollNumberFormSchema = z.object({
  rollNumber: z
    .string()
    .transform(normalizeRollNumber)
    .pipe(
      z
        .string()
        .max(32, "That roll number is too long.")
        .regex(/^[A-Z0-9/-]*$/, "Use letters, numbers, / or - only."),
    ),
});
