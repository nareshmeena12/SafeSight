import "server-only";
import nodemailer from "nodemailer";

/**
 * Outgoing email (S19, the weekly digest). Two ways, chosen from env:
 * Resend (RESEND_API_KEY) or any SMTP server (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, SMTP_SECURE). Both need EMAIL_FROM. With neither,
 * `emailConfigured()` is false and callers keep things in-app only.
 */

type Provider = { kind: "resend"; apiKey: string } | { kind: "smtp"; host: string; port: number; secure: boolean; user?: string; pass?: string };

function provider(): Provider | null {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) return null;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) return { kind: "resend", apiKey };
  const host = process.env.SMTP_HOST?.trim();
  if (host) {
    const port = Number(process.env.SMTP_PORT) || 587;
    return {
      kind: "smtp",
      host,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      user: process.env.SMTP_USER?.trim() || undefined,
      pass: process.env.SMTP_PASS || undefined,
    };
  }
  return null;
}

export function emailConfigured() {
  return provider() !== null;
}

export type Email = { to: string; subject: string; text: string; html: string };
export type SendResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 15_000;

async function sendOnce(p: Provider, email: Email): Promise<void> {
  const from = process.env.EMAIL_FROM!.trim();
  if (p.kind === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    auth: p.user ? { user: p.user, pass: p.pass } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  await transport.sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html });
}

/** Sends one email, with one retry. Never throws. */
export async function sendEmail(email: Email): Promise<SendResult> {
  const p = provider();
  if (!p) return { ok: false, error: "Email is not configured." };
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sendOnce(p, email);
      return { ok: true };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      console.warn(`email attempt ${attempt + 1} failed:`, last);
    }
  }
  return { ok: false, error: last.slice(0, 500) };
}
