import { z } from "zod";
import { signupRoles } from "./roles";

// Trim and lowercase before checking the format, so pasted spaces are fine.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
  next: z.string().max(512).optional(),
});

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Keep your name under 120 characters."),
  email: emailField,
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use at most 72 characters."),
  role: z.enum(signupRoles, "Choose student or teacher."),
});

export type FieldErrors = Partial<Record<string, string>>;

export type AuthFormState = {
  status: "idle" | "error" | "check-email";
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
