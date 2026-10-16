import { z } from "zod";

/** zod schemas for the teacher app's forms (every server input is checked). */

export const aiModes = ["learn", "assist", "exam"] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => v ?? "");

export const courseSchema = z.object({
  courseId: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, "Give the course a name.")
    .max(200, "Keep the name under 200 characters."),
  code: optionalText(32, "Keep the code under 32 characters.").transform((v) => v.toUpperCase()),
});

/**
 * `<input type="datetime-local">` sends "2026-10-20T17:00" with no zone. Our
 * colleges are in India, so read it as India time.
 */
const dueAt = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}+05:30`);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "Pick a valid date and time." });
      return z.NEVER;
    }
    return parsed.toISOString();
  });

export const assignmentSchema = z.object({
  courseId: z.uuid(),
  assignmentId: z.uuid().optional(),
  title: z
    .string()
    .trim()
    .min(2, "Give the assignment a title.")
    .max(200, "Keep the title under 200 characters."),
  instructions: optionalText(10_000, "Keep the instructions under 10,000 characters."),
  aiMode: z.enum(aiModes, "Choose how Sage may help."),
  teacherNotes: optionalText(4_000, "Keep the notes under 4,000 characters."),
  dueAt,
});

export const flagStatusSchema = z.object({
  flagId: z.uuid(),
  status: z.enum(["open", "resolved"]),
});

export const courseIdSchema = z.object({ courseId: z.uuid() });

export const optionalCourseIdSchema = z.object({
  courseId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => v || null),
});

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export function fieldErrorsFrom(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Convert an ISO timestamp to the value a datetime-local input expects (India time). */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}
