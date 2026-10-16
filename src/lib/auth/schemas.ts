import { z } from "zod";
import { signupRoles } from "./roles";

// Messages follow design/landing/Auth.dc.html. Trim and lowercase before
// checking the format, so pasted spaces are fine.
const emailField = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .pipe(z.email("That email looks incomplete, like name@college.edu.in."));

export const loginSchema = z.object({
  email: emailField,
  password: z.string("Enter your password.").min(1, "Enter your password."),
  next: z.string().max(512).optional(),
});

export const magicLinkSchema = z.object({
  email: emailField,
  next: z.string().max(512).optional(),
});

/** Course join codes are 6 letters or digits (courses.join_code). */
export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "Class codes are 6 letters or numbers, like THRM01.");

export const signupSchema = z
  .object({
    fullName: z
      .string("Please tell us your name.")
      .trim()
      .min(2, "Please tell us your name.")
      .max(120, "Keep your name under 120 characters."),
    email: emailField,
    password: z
      .string("Choose a password with at least 8 characters.")
      .min(8, "Use at least 8 characters.")
      .max(72, "Use at most 72 characters."),
    role: z.enum(signupRoles, "Choose student or teacher."),
    // Teachers only: where they teach. Kept in user metadata until an
    // institution flow exists (profiles.institution_id stays null).
    institution: z
      .string()
      .trim()
      .max(200, "Keep the institution name under 200 characters.")
      .optional(),
    // Students only, optional: joined right after sign-up or on email confirm.
    joinCode: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(joinCodeSchema.optional()),
  })
  .superRefine((data, ctx) => {
    if (data.role === "teacher" && !data.institution) {
      ctx.addIssue({
        code: "custom",
        path: ["institution"],
        message: "Which college or institute do you teach at?",
      });
    }
  })
  .transform((data) => ({
    ...data,
    institution: data.role === "teacher" ? data.institution : undefined,
    joinCode: data.role === "student" ? data.joinCode : undefined,
  }));

export type FieldErrors = Partial<Record<string, string>>;

export type AuthFormState = {
  status: "idle" | "error" | "check-email" | "link-sent";
  message?: string;
  fieldErrors?: FieldErrors;
  email?: string;
};

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Password strength 0–4 for the sign-up meter (design/landing/Auth.dc.html). */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || (/[A-Z]/.test(pw) && /[a-z]/.test(pw))) score++;
  return score;
}

export const strengthLabels = [
  "Too short so far.",
  "Okay. A longer one is safer.",
  "Good password.",
  "Strong password.",
  "Very strong password.",
] as const;
