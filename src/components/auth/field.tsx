import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
};

/** App-style form field (shadcn Input). Used by the app and shown on /design. */
export function Field({ name, label, error, hint, ...input }: FieldProps) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {error ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// The rest is the site-style auth form (design/landing/Auth.dc.html), styled
// by components/marketing/site.css inside the `.ss` wrapper.

/** Inline field error in the site style (design/landing/Auth.dc.html). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="err" id={id}>
      <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
      {message}
    </p>
  );
}

/** Form-level message from the server (wrong password, rate limit, ...). */
export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="form-alert" role="alert">
      <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
      {message}
    </p>
  );
}

/** Password input with a Show/Hide toggle. */
export function PasswordInput({
  id,
  show,
  onToggle,
  ...input
}: React.ComponentProps<"input"> & { id: string; show: boolean; onToggle: () => void }) {
  return (
    <div className="pw-wrap">
      <input className="input" id={id} type={show ? "text" : "password"} {...input} />
      <button
        type="button"
        className="pw-toggle"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** Shown after a sign-in or confirmation link was sent. */
export function CheckInbox({
  text,
  email,
  onBack,
}: {
  text: string;
  email: string;
  onBack: () => void;
}) {
  return (
    <div role="status" aria-live="polite">
      <div className="mail-ic" aria-hidden="true">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>
      <h1 className="auth-h">Check your inbox</h1>
      <p className="auth-p">
        {text} <b style={{ color: "var(--text)", fontWeight: 500 }}>{email}</b>. The link works
        once.
      </p>
      <Link className="btn btn--secondary btn--block" href="/">
        Back to the website
      </Link>
      <p className="auth-switch">
        Wrong address?
        <button type="button" onClick={onBack}>
          Change email
        </button>
      </p>
    </div>
  );
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailError(email: string): string | undefined {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (!emailPattern.test(value)) return "That email looks incomplete, like name@college.edu.in.";
  return undefined;
}
