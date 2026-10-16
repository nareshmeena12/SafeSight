import { z } from "zod";

/** Roles offered on the pilot form, and how each is stored (`pilot_role`). */
export const pilotFormRoles = {
  Professor: "teacher",
  HOD: "hod",
  Dean: "admin",
  Other: "other",
} as const;

export type PilotFormRole = keyof typeof pilotFormRoles;

/**
 * The pilot request form (design/landing/PilotPanel.dc.html). Messages match
 * the design; the client runs the same checks for inline errors, the API
 * route runs this schema again before anything is stored.
 */
export const pilotRequestSchema = z.object({
  name: z
    .string("Please tell us your name.")
    .trim()
    .min(1, "Please tell us your name.")
    .max(120, "Keep your name under 120 characters."),
  role: z.enum(
    Object.keys(pilotFormRoles) as [PilotFormRole, ...PilotFormRole[]],
    "Choose the role closest to yours.",
  ),
  institution: z
    .string("Which college or institute are you from?")
    .trim()
    .min(1, "Which college or institute are you from?")
    .max(200, "Keep the institution name under 200 characters."),
  email: z
    .string("We need an email address to reach you.")
    .trim()
    .toLowerCase()
    .min(1, "We need an email address to reach you.")
    .max(254, "That email address is too long.")
    .regex(
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      "That email looks incomplete. Check the part after the @, like name@college.edu.in.",
    ),
  // Hidden field people never see; bots tend to fill it in.
  website: z.string().max(200).optional(),
});

export type PilotRequestInput = z.input<typeof pilotRequestSchema>;
export type PilotField = "name" | "role" | "institution" | "email";
export type PilotFieldErrors = Partial<Record<PilotField, string>>;

/** Field errors in form order, first message per field. */
export function pilotFieldErrors(input: unknown): PilotFieldErrors {
  const parsed = pilotRequestSchema.safeParse(input);
  if (parsed.success) return {};
  const out: PilotFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (key === "name" || key === "role" || key === "institution" || key === "email") {
      out[key] ??= issue.message;
    }
  }
  return out;
}

/** "Dr. Ananya Rao" → "Dr. Rao"; "Riya Sharma" → "Riya". */
export function greetingName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && /^(dr|prof|mr|ms|mrs)\.?$/i.test(parts[0])) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return parts[0] || "there";
}
