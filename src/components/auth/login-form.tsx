"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { login, sendMagicLink } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/schemas";
import { CheckInbox, emailError, FieldError, FormMessage, PasswordInput } from "./field";

const initial: AuthFormState = { status: "idle" };

/**
 * Log in with email + password, or ask for a one-time sign-in link
 * ("Email me a sign-in link" and "Forgot password?" both send one).
 */
export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [loginState, loginAction, loggingIn] = useActionState(login, initial);
  const [linkState, linkAction, sendingLink] = useActionState(sendMagicLink, initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [attempted, setAttempted] = useState<"login" | "link" | null>(null);
  const [dismissed, setDismissed] = useState<AuthFormState | null>(null);

  const errors = {
    email: emailError(email),
    password: password ? undefined : "Enter your password.",
  };
  const showEmail = attempted || touched.email ? errors.email : undefined;
  const showPassword =
    attempted === "login" || touched.password ? errors.password : undefined;
  const serverField = (key: "email" | "password") =>
    loginState.fieldErrors?.[key] ?? linkState.fieldErrors?.[key];

  if (linkState.status === "link-sent" && dismissed !== linkState) {
    return (
      <CheckInbox
        text="We sent a sign-in link to"
        email={linkState.email ?? email}
        onBack={() => setDismissed(linkState)}
      />
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const intent = submitter?.dataset.intent === "link" ? "link" : "login";
    setAttempted(intent);
    if (errors.email) {
      event.preventDefault();
      document.getElementById("au-email")?.focus();
    } else if (intent === "login" && errors.password) {
      event.preventDefault();
      document.getElementById("au-pw")?.focus();
    }
  }

  const busy = loggingIn || sendingLink;
  const message = loginState.message ?? linkState.message ?? notice;
  const emailMsg = showEmail ?? serverField("email");
  const passwordMsg = showPassword ?? serverField("password");

  return (
    <form action={loginAction} onSubmit={onSubmit} noValidate aria-labelledby="au-title-login">
      <h1 className="auth-h" id="au-title-login">
        Welcome back
      </h1>
      <p className="auth-p">Log in to continue with your courses.</p>
      <FormMessage message={message} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="fields">
        <div className={emailMsg ? "field has-err" : "field"}>
          <label htmlFor="au-email">Email</label>
          <input
            className="input"
            id="au-email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            placeholder="you@college.edu.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={emailMsg ? true : undefined}
            aria-describedby="au-email-err"
          />
          <FieldError id="au-email-err" message={emailMsg} />
        </div>
        <div className={passwordMsg ? "field has-err" : "field"}>
          <div className="label-row">
            <label htmlFor="au-pw">Password</label>
            <button
              type="submit"
              className="text-btn"
              formAction={linkAction}
              formNoValidate
              data-intent="link"
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="au-pw"
            name="password"
            autoComplete="current-password"
            show={showPw}
            onToggle={() => setShowPw((v) => !v)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            aria-invalid={passwordMsg ? true : undefined}
            aria-describedby="au-pw-err"
          />
          <FieldError id="au-pw-err" message={passwordMsg} />
        </div>
        <button
          type="submit"
          className={loggingIn ? "btn btn--primary btn--submit is-busy" : "btn btn--primary btn--submit"}
          aria-disabled={busy}
          data-intent="login"
        >
          {loggingIn ? (
            <>
              <span className="spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            "Log in"
          )}
        </button>
      </div>
      <div className="divider">or</div>
      <button
        type="submit"
        className={sendingLink ? "btn btn--secondary btn--block is-busy" : "btn btn--secondary btn--block"}
        formAction={linkAction}
        formNoValidate
        data-intent="link"
        aria-disabled={busy}
      >
        {sendingLink ? (
          <span className="spin" aria-hidden="true" />
        ) : (
          <Mail size={18} strokeWidth={1.5} aria-hidden="true" />
        )}
        Email me a sign-in link
      </button>
      <p className="auth-switch">
        New to SafeSight?
        <Link href="/signup">
          Create an account
        </Link>
      </p>
    </form>
  );
}
