"use client";

import { ArrowRight, Check, ChevronDown, CircleAlert } from "lucide-react";
import { useRef, useState } from "react";
import {
  greetingName,
  pilotFieldErrors,
  pilotFormRoles,
  type PilotField,
  type PilotFieldErrors,
} from "@/lib/pilot/schema";
import { Section } from "./section";

type Form = Record<PilotField, string>;
const empty: Form = { name: "", role: "", institution: "", email: "" };
const order: PilotField[] = ["name", "role", "institution", "email"];
const ids: Record<PilotField, string> = {
  name: "pf-name",
  role: "pf-role",
  institution: "pf-inst",
  email: "pf-email",
};

function FieldError({ field, message }: { field: PilotField; message?: string }) {
  if (!message) return null;
  return (
    <p className="err" id={`${ids[field]}-err`}>
      <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
      {message}
    </p>
  );
}

/** Final call to action: the pilot request form (design/landing/PilotPanel.dc.html). */
export function PilotPanel() {
  const [form, setForm] = useState<Form>(empty);
  const [touched, setTouched] = useState<Partial<Record<PilotField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<PilotFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);

  const clientErrors = pilotFieldErrors(form);
  const visible = (k: PilotField) =>
    attempted || touched[k] ? (serverErrors[k] ?? clientErrors[k]) : undefined;

  const field = (k: PilotField) => ({
    id: ids[k],
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setServerErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    },
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    "aria-invalid": visible(k) ? true : undefined,
  });
  const fieldClass = (k: PilotField) => (visible(k) ? "field has-err" : "field");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const errs = pilotFieldErrors(form);
    const first = order.find((k) => errs[k]);
    if (first) {
      setAttempted(true);
      document.getElementById(ids[first])?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, website: honeypot.current?.value || undefined }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        fieldErrors?: PilotFieldErrors;
      };
      if (data.fieldErrors && Object.keys(data.fieldErrors).length) {
        setServerErrors(data.fieldErrors);
        setAttempted(true);
        const firstServer = order.find((k) => data.fieldErrors?.[k]);
        if (firstServer) document.getElementById(ids[firstServer])?.focus();
      } else {
        setFormError(
          data.message ?? "We couldn't send your request just now. Please try again in a minute.",
        );
      }
    } catch {
      setFormError("We couldn't reach SafeSight. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(empty);
    setTouched({});
    setAttempted(false);
    setServerErrors({});
    setDone(false);
  }

  return (
    <Section id="pilot" label="Request a pilot">
      <div className="wrap rv">
        <div className="pilot">
          <div>
            <p className="eyebrow">Pilot programme</p>
            <h2 className="pilot-h">
              Bring SafeSight to your course <em>next semester.</em>
            </h2>
            <p className="pilot-lead">
              Tell us a little about you. We&apos;ll set up Sage with your notes and walk you
              through the dashboard.
            </p>
            <ul className="pilot-pts">
              {["Start with a single course", "We do the setup with you", "Always free for students"].map(
                (point) => (
                  <li key={point}>
                    <Check size={18} strokeWidth={1.5} aria-hidden="true" />
                    {point}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="form-card">
            {done ? (
              <div className="done" role="status" aria-live="polite">
                <div className="check-wrap" aria-hidden="true">
                  <span className="check-ring" />
                  <span className="check-ring2" />
                  <svg
                    className="check-svg"
                    width="34"
                    height="34"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5 10 17.5 19.5 7" />
                  </svg>
                </div>
                <h3>Thank you, {greetingName(form.name)}.</h3>
                <p>
                  Your pilot request is in. We&apos;ll write to <b>{form.email.trim()}</b> soon to
                  plan a pilot for <b>{form.institution.trim()}</b>.
                </p>
                <ol className="next">
                  <li>
                    <span className="mono">1</span>A short call about your course and what
                    you&apos;d like students to get from it.
                  </li>
                  <li>
                    <span className="mono">2</span>We set up Sage with your notes and choose a mode
                    for each assignment together.
                  </li>
                  <li>
                    <span className="mono">3</span>Your students start learning with Sage next
                    semester.
                  </li>
                </ol>
                <button type="button" className="link-btn" onClick={reset}>
                  Send another request
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate aria-labelledby="pf-title">
                <p className="form-title" id="pf-title">
                  Request a pilot
                </p>
                {/* Honeypot: hidden from people and assistive tech. */}
                <div style={{ position: "absolute", left: "-10000px" }} aria-hidden="true">
                  <label htmlFor="pf-website">Website</label>
                  <input ref={honeypot} id="pf-website" type="text" tabIndex={-1} autoComplete="off" />
                </div>
                <div className="fields">
                  <div className="field-row">
                    <div className={fieldClass("name")}>
                      <label htmlFor="pf-name">Name</label>
                      <input
                        className="input"
                        type="text"
                        autoComplete="name"
                        placeholder="Dr. Ananya Rao"
                        aria-describedby="pf-name-err"
                        {...field("name")}
                      />
                      <FieldError field="name" message={visible("name")} />
                    </div>
                    <div className={fieldClass("role")}>
                      <label htmlFor="pf-role">Role</label>
                      <div className="select-wrap">
                        <select
                          className={form.role ? "select" : "select is-empty"}
                          aria-describedby="pf-role-err"
                          {...field("role")}
                        >
                          <option value="">Select your role</option>
                          {Object.keys(pilotFormRoles).map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <FieldError field="role" message={visible("role")} />
                    </div>
                  </div>
                  <div className={fieldClass("institution")}>
                    <label htmlFor="pf-inst">Institution</label>
                    <input
                      className="input"
                      type="text"
                      autoComplete="organization"
                      placeholder="College or institute name"
                      aria-describedby="pf-inst-err"
                      {...field("institution")}
                    />
                    <FieldError field="institution" message={visible("institution")} />
                  </div>
                  <div className={fieldClass("email")}>
                    <label htmlFor="pf-email">Work email</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@college.edu.in"
                      aria-describedby="pf-email-err pf-email-help"
                      {...field("email")}
                    />
                    <FieldError field="email" message={visible("email")} />
                    {visible("email") ? null : (
                      <p className="help" id="pf-email-help">
                        We&apos;ll only use this to plan your pilot.
                      </p>
                    )}
                  </div>
                  {formError ? (
                    <p className="err" role="alert">
                      <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
                      {formError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className={busy ? "btn btn--primary btn--submit is-busy" : "btn btn--primary btn--submit"}
                    aria-disabled={busy}
                  >
                    {busy ? (
                      <>
                        <span className="spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Request a pilot
                        <ArrowRight className="nudge" size={18} strokeWidth={1.5} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
                <p className="form-foot">
                  No commitment. We&apos;ll reply from a real person, not a mailing list.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
