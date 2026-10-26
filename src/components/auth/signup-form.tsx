"use client";

import { Check, GraduationCap, Presentation } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "@/lib/auth/actions";
import { passwordStrength, strengthLabels, type AuthFormState } from "@/lib/auth/schemas";
import { CheckInbox, emailError, FieldError, FormMessage, PasswordInput } from "./field";

const initial: AuthFormState = { status: "idle" };

type Role = "student" | "teacher";
type Field = "fullName" | "email" | "institution" | "password";
const ids: Record<Field, string> = {
  fullName: "au-name",
  email: "au-email2",
  institution: "au-inst",
  password: "au-pw2",
};

const roles = [
  { value: "student", label: "Student", detail: "Learn with Sage in your courses", Icon: GraduationCap },
  { value: "teacher", label: "Teacher", detail: "Set up courses and see class insights", Icon: Presentation },
] as const;

/** `defaults` come from an invite link (/signup?email=…&code=… or …&role=teacher&institution=…). */
export function SignupForm({
  defaultRole = "student",
  defaults,
}: {
  defaultRole?: Role;
  defaults?: { email?: string; joinCode?: string; institution?: string };
}) {
  const [state, action, pending] = useActionState(signup, initial);
  const [role, setRole] = useState<Role>(defaultRole);
  const [form, setForm] = useState({
    fullName: "",
    email: defaults?.email ?? "",
    institution: defaults?.institution ?? "",
    joinCode: defaults?.joinCode ?? "",
    password: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [dismissed, setDismissed] = useState<AuthFormState | null>(null);

  const pw = form.password;
  const errors: Partial<Record<Field, string>> = {
    fullName: form.fullName.trim().length >= 2 ? undefined : "Please tell us your name.",
    email: emailError(form.email),
    institution:
      role === "teacher" && !form.institution.trim()
        ? "Which college or institute do you teach at?"
        : undefined,
    password:
      pw.length >= 8
        ? undefined
        : pw
          ? `Use at least 8 characters. Add ${8 - pw.length} more.`
          : "Choose a password with at least 8 characters.",
  };
  const shown = (k: Field) =>
    (attempted || touched[k] ? errors[k] : undefined) ??
    (k === "fullName" ? state.fieldErrors?.fullName : state.fieldErrors?.[k]);

  if (state.status === "check-email" && dismissed !== state) {
    return (
      <CheckInbox
        text="We sent a link to confirm your account to"
        email={state.email ?? form.email}
        onBack={() => setDismissed(state)}
      />
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k: Field) => () => setTouched((t) => ({ ...t, [k]: true }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    setAttempted(true);
    const first = (["fullName", "email", "institution", "password"] as Field[]).find(
      (k) => errors[k],
    );
    if (first) {
      event.preventDefault();
      document.getElementById(ids[first])?.focus();
    }
  }

  const score = passwordStrength(pw);
  const strengthText = !pw ? "At least 8 characters." : pw.length < 8 ? strengthLabels[0] : strengthLabels[score];
  const fieldClass = (k: Field) => (shown(k) ? "field has-err" : "field");

  return (
    <form action={action} onSubmit={onSubmit} noValidate aria-labelledby="au-title-signup">
      <h1 className="auth-h" id="au-title-signup">
        Create your account
      </h1>
      <p className="auth-p">Pick the option that fits you. It shapes what you&apos;ll see in SafeSight.</p>
      <FormMessage message={state.message} />
      <input type="hidden" name="role" value={role} />
      <fieldset className="roles">
        <legend>I am a</legend>
        {roles.map(({ value, label, detail, Icon }) => {
          const selected = role === value;
          return (
            <button
              key={value}
              type="button"
              className={selected ? "role is-sel" : "role"}
              aria-pressed={selected}
              onClick={() => setRole(value)}
            >
              <span className="role-dot" aria-hidden="true">
                {selected ? <Check size={12} strokeWidth={2.5} /> : null}
              </span>
              <span className="role-ic" aria-hidden="true">
                <Icon size={18} strokeWidth={1.5} />
              </span>
              <b>{label}</b>
              <small>{detail}</small>
            </button>
          );
        })}
      </fieldset>

      <div className="fields">
        <div className={fieldClass("fullName")}>
          <label htmlFor="au-name">Full name</label>
          <input
            className="input"
            id="au-name"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder={role === "teacher" ? "Dr. Ananya Rao" : "Riya Sharma"}
            value={form.fullName}
            onChange={set("fullName")}
            onBlur={blur("fullName")}
            aria-invalid={shown("fullName") ? true : undefined}
            aria-describedby="au-name-err"
          />
          <FieldError id="au-name-err" message={shown("fullName")} />
        </div>

        <div className={fieldClass("email")}>
          <label htmlFor="au-email2">College email</label>
          <input
            className="input"
            id="au-email2"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            placeholder="you@college.edu.in"
            value={form.email}
            onChange={set("email")}
            onBlur={blur("email")}
            aria-invalid={shown("email") ? true : undefined}
            aria-describedby="au-email2-err au-email2-help"
          />
          <FieldError id="au-email2-err" message={shown("email")} />
          {shown("email") ? null : (
            <p className="help" id="au-email2-help">
              Use your college email so we can connect you to your institution.
            </p>
          )}
        </div>

        {role === "teacher" ? (
          <div className={fieldClass("institution")}>
            <label htmlFor="au-inst">Institution</label>
            <input
              className="input"
              id="au-inst"
              name="institution"
              type="text"
              autoComplete="organization"
              placeholder="College or institute name"
              value={form.institution}
              onChange={set("institution")}
              onBlur={blur("institution")}
              aria-invalid={shown("institution") ? true : undefined}
              aria-describedby="au-inst-err"
            />
            <FieldError id="au-inst-err" message={shown("institution")} />
          </div>
        ) : (
          <div className={state.fieldErrors?.joinCode ? "field has-err" : "field"}>
            <label htmlFor="au-code">
              Class code <span className="optional">(optional)</span>
            </label>
            <input
              className="input mono"
              id="au-code"
              name="joinCode"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              placeholder="THRM01"
              value={form.joinCode}
              onChange={set("joinCode")}
              aria-describedby="au-code-err au-code-help"
            />
            <FieldError id="au-code-err" message={state.fieldErrors?.joinCode} />
            <p className="help" id="au-code-help">
              Your teacher shares this. You can add it later too.
            </p>
          </div>
        )}

        <div className={fieldClass("password")}>
          <label htmlFor="au-pw2">Password</label>
          <PasswordInput
            id="au-pw2"
            name="password"
            autoComplete="new-password"
            show={showPw}
            onToggle={() => setShowPw((v) => !v)}
            value={pw}
            onChange={set("password")}
            onBlur={blur("password")}
            aria-invalid={shown("password") ? true : undefined}
            aria-describedby="au-pw2-err au-pw2-help"
          />
          <div className="strength" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < score ? "on" : undefined} />
            ))}
          </div>
          <FieldError id="au-pw2-err" message={shown("password")} />
          {shown("password") ? null : (
            <p className="help" id="au-pw2-help">
              {strengthText}
            </p>
          )}
        </div>

        <button
          type="submit"
          className={pending ? "btn btn--primary btn--submit is-busy" : "btn btn--primary btn--submit"}
          aria-disabled={pending}
        >
          {pending ? (
            <>
              <span className="spin" aria-hidden="true" />
              Creating your account…
            </>
          ) : role === "teacher" ? (
            "Create teacher account"
          ) : (
            "Create student account"
          )}
        </button>
      </div>
      <p className="legal">
        By continuing you agree to our <Link href="/privacy">privacy policy</Link>. Student data is
        never used to train AI models.
      </p>
      <p className="auth-switch">
        Already have an account?
        <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
