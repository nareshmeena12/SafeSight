/**
 * The email a teacher (or admin) gets when their college admin invites them
 * (S25), and the same text to share by hand when email isn't set up. Pure.
 */

export type StaffInviteInput = {
  name: string;
  email: string;
  role: "teacher" | "admin";
  institutionName: string;
  invitedBy: string;
  siteUrl: string;
  /** Which one-click sign-ins are switched on. */
  sso: { google: boolean; microsoft: boolean };
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function staffSignupLink(i: Pick<StaffInviteInput, "siteUrl" | "email" | "institutionName">) {
  const q = new URLSearchParams({ email: i.email, role: "teacher", institution: i.institutionName });
  return `${i.siteUrl.replace(/\/$/, "")}/signup?${q}`;
}

function ssoLine(sso: StaffInviteInput["sso"]) {
  const names = [sso.google ? "Google" : null, sso.microsoft ? "Microsoft" : null].filter(Boolean);
  return names.length ? `You can also use “Continue with ${names.join("” or “Continue with ")}” on the log-in page with this email.` : "";
}

const roleWord = (r: StaffInviteInput["role"]) => (r === "admin" ? "an admin" : "a teacher");

export function staffInviteSubject(i: StaffInviteInput) {
  return `${i.institutionName}: you're invited to SafeSight as ${roleWord(i.role)}`;
}

export function staffInviteText(i: StaffInviteInput) {
  const base = i.siteUrl.replace(/\/$/, "");
  return [
    i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,",
    "",
    `${i.invitedBy || "Your college admin"} has invited you to SafeSight as ${roleWord(i.role)} at ${i.institutionName}.`,
    "",
    `Create your account with this email (${i.email}):`,
    staffSignupLink(i),
    "",
    `Already have an account? Log in with this email at ${base}/login and your teacher access is added.`,
    ssoLine(i.sso),
  ]
    .filter((l, idx, all) => l !== "" || all[idx - 1] !== "")
    .join("\n")
    .trim();
}

export function staffInviteHtml(i: StaffInviteInput) {
  const base = i.siteUrl.replace(/\/$/, "");
  const primary = "#1F6F5C";
  const muted = "#6B6F7B";
  const sso = ssoLine(i.sso);
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FAF8F3;color:#14161F;font-family:Geist,Inter,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:560px;margin:0 auto;border:1px solid #E7E3DA;border-radius:16px;padding:24px;background:#FFFFFF">
<p style="margin:0 0 4px;color:${muted};font-size:13px;letter-spacing:.06em;text-transform:uppercase">SafeSight</p>
<p style="margin:0 0 12px">${esc(i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,")}</p>
<p style="margin:0 0 8px">${esc(i.invitedBy || "Your college admin")} has invited you to SafeSight as ${roleWord(i.role)} at <strong>${esc(i.institutionName)}</strong>.</p>
<p style="margin:0 0 8px">Create your account with this email (${esc(i.email)}).</p>
<p style="margin:16px 0"><a href="${esc(staffSignupLink(i))}" style="display:inline-block;background:${primary};color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:12px">Create your account</a></p>
<p style="margin:0;color:${muted};font-size:14px">Already have an account? <a href="${esc(`${base}/login`)}" style="color:${primary}">Log in</a> with this email and your access is added.${sso ? ` ${esc(sso)}` : ""}</p>
</div></body></html>`;
}
