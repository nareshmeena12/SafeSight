import { z } from "zod";
import { policyModes } from "./policy";

/** zod schemas for the admin area's forms (S23). Every server input is checked. */

const optionalUuid = z
  .union([z.uuid(), z.literal("")])
  .optional()
  .transform((v) => v || null);

export const departmentSchema = z.object({
  departmentId: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, "Give the department a name.")
    .max(120, "Keep the name under 120 characters."),
  code: z
    .string()
    .trim()
    .max(16, "Keep the code under 16 characters.")
    .optional()
    .transform((v) => (v ?? "").toUpperCase()),
});

export const departmentIdSchema = z.object({ departmentId: z.uuid() });

/** Switches post "on" when checked and nothing when not. */
const switchValue = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const policySchema = z
  .object({
    /** Empty = the college default. */
    departmentId: optionalUuid,
    allowedModes: z
      .array(z.enum(policyModes))
      .min(1, "Allow at least one mode.")
      .transform((modes) => policyModes.filter((m) => modes.includes(m))),
    defaultMode: z.enum(policyModes, "Choose the mode new assignments start in."),
    maxHintLevel: z.coerce.number<string>("Choose the highest hint step.").int().min(1).max(4),
    workedExamples: switchValue,
    labModeAllowed: switchValue,
    teachersCanLoosen: switchValue,
  })
  .refine((p) => p.allowedModes.includes(p.defaultMode), {
    path: ["defaultMode"],
    message: "New assignments must start in a mode you allow.",
  });

export type PolicyInput = z.infer<typeof policySchema>;

export const teacherDepartmentSchema = z.object({ teacherId: z.uuid(), departmentId: optionalUuid });
export const courseDepartmentSchema = z.object({ courseId: z.uuid(), departmentId: optionalUuid });

export const inviteFormSchema = z.object({
  emails: z.string().trim().min(3, "Add at least one email address.").max(20_000, "That list is too long."),
  departmentId: optionalUuid,
});

export const inviteIdSchema = z.object({ inviteId: z.uuid() });

export const MAX_INVITES_AT_ONCE = 50;

export type ParsedInvite = { name: string; email: string };

const emailPattern = /^[^\s@<>(),;"]+@[^\s@<>(),;"]+\.[^\s@<>(),;"]+$/;

/**
 * One teacher per line (or separated by semicolons): `email`,
 * `Name <email>`, or `Name, email` / `email, Name`. Emails are lowercased and
 * deduped; lines without a valid email are returned in `invalid`.
 */
export function parseTeacherInvites(text: string): { invites: ParsedInvite[]; invalid: string[] } {
  const seen = new Set<string>();
  const invites: ParsedInvite[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const angle = line.match(/^(.*?)<\s*([^>]+?)\s*>\s*$/);
    let email = "";
    let name = "";
    if (angle) {
      email = angle[2];
      name = angle[1];
    } else {
      const parts = line.split(/[,\t]+/).map((p) => p.trim()).filter(Boolean);
      const at = parts.findIndex((p) => p.includes("@"));
      if (at >= 0) {
        email = parts[at];
        name = parts.filter((_, i) => i !== at).join(" ");
      }
    }
    email = email.trim().toLowerCase();
    name = name.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!emailPattern.test(email) || email.length > 254) {
      invalid.push(line.slice(0, 120));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    invites.push({ name, email });
  }
  return { invites, invalid };
}
