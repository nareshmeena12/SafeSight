import { z } from "zod";

/**
 * Email domains per institution (S25). Pure, so the admin form, the sign-up
 * check and the tests read domains the same way as the database
 * (`private.institution_for_email`): an email at a subdomain
 * (students.college.edu.in) belongs to the parent domain (college.edu.in).
 */

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Webmail domains that can never belong to one institution. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "rediffmail.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "zoho.com",
  "yandex.com",
]);

/** "@College.edu.in", "https://college.edu.in/", "college.edu.in" → "college.edu.in"; null when it isn't a domain. */
export function normaliseDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^.*@/, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return d.length <= 253 && DOMAIN.test(d) ? d : null;
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

/** True when the email is at `domain` or one of its subdomains. */
export function emailAtDomain(email: string, domain: string): boolean {
  const at = emailDomain(email);
  return at === domain || at.endsWith(`.${domain}`);
}

/** True unless the institution only takes its own domains and the email isn't at one. */
export function emailAllowed(email: string, rule: { domainsOnly: boolean; domains: readonly string[] }): boolean {
  return !rule.domainsOnly || rule.domains.some((d) => emailAtDomain(email, d));
}

export const domainSchema = z
  .string()
  .trim()
  .min(1, "Type a domain, like college.edu.in.")
  .transform((v, ctx) => {
    const d = normaliseDomain(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "That doesn't look like a domain. Type it like college.edu.in." });
      return z.NEVER;
    }
    if (PUBLIC_EMAIL_DOMAINS.has(d)) {
      ctx.addIssue({ code: "custom", message: `${d} is a public email service, so it can't belong to one college.` });
      return z.NEVER;
    }
    return d;
  });

/** The message shown when a class code belongs to an institution that only takes its own domains. */
export function domainRuleMessage(domains: readonly string[]): string {
  const list = domains.slice(0, 3).map((d) => `@${d}`).join(" or ");
  return list
    ? `This class is only open to college email addresses (${list}). Please use your college email.`
    : "This class is only open to college email addresses. Please use your college email.";
}
