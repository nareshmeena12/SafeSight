/**
 * The email a teacher gets when their institution's admin invites them (S23),
 * and the same text to share by hand when email isn't set up. Pure.
 */

export type TeacherInviteInput = {
  name: string;
  email: string;
  institutionName: string;
  departmentName: string;
  adminName: string;
  siteUrl: string;
  /** They already had an account and were added straight away. */
  added: boolean;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function teacherSignupLink(siteUrl: string, email: string, institutionName: string) {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/signup?${new URLSearchParams({ email, role: "teacher", institution: institutionName }).toString()}`;
}

function where(i: TeacherInviteInput) {
  return i.departmentName ? `the ${i.departmentName} department at ${i.institutionName}` : i.institutionName;
}

export function teacherInviteSubject(i: TeacherInviteInput) {
  return i.added ? `You're set up as a teacher at ${i.institutionName} on SafeSight` : `Join ${i.institutionName} on SafeSight`;
}

export function teacherInviteText(i: TeacherInviteInput) {
  const base = i.siteUrl.replace(/\/$/, "");
  const hello = i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,";
  const from = i.adminName || "Your college's SafeSight admin";
  if (i.added) {
    return [
      hello,
      "",
      `${from} has set you up as a teacher in ${where(i)} on SafeSight. Log in with ${i.email} to start a course:`,
      `${base}/login`,
    ].join("\n");
  }
  return [
    hello,
    "",
    `${from} has invited you to teach on SafeSight, in ${where(i)}. SafeSight's tutor, Sage, coaches your students through their work instead of doing it for them, and shows you where the class needs help.`,
    "",
    `Create your account with this email (${i.email}) and you'll be set up as a teacher straight away:`,
    teacherSignupLink(base, i.email, i.institutionName),
    "",
    `Already have an account? Log in with this email at ${base}/login`,
  ].join("\n");
}

export function teacherInviteHtml(i: TeacherInviteInput) {
  const base = i.siteUrl.replace(/\/$/, "");
  const primary = "#1F6F5C";
  const muted = "#6B6F7B";
  const from = esc(i.adminName || "Your college's SafeSight admin");
  const link = i.added ? `${base}/login` : teacherSignupLink(base, i.email, i.institutionName);
  const body = i.added
    ? `<p style="margin:0 0 8px">${from} has set you up as a teacher in <strong>${esc(where(i))}</strong>. Log in with ${esc(i.email)} to start a course.</p>`
    : `<p style="margin:0 0 8px">${from} has invited you to teach on SafeSight, in <strong>${esc(where(i))}</strong>. Sage coaches your students through their work instead of doing it for them, and shows you where the class needs help.</p>
<p style="margin:0 0 8px">Create your account with this email (${esc(i.email)}) and you'll be set up as a teacher straight away.</p>`;
  const foot = i.added
    ? ""
    : `<p style="margin:0;color:${muted};font-size:14px">Already have an account? Log in with this email.</p>`;
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FAF8F3;color:#14161F;font-family:Geist,Inter,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:560px;margin:0 auto;border:1px solid #E7E3DA;border-radius:16px;padding:24px;background:#FFFFFF">
<p style="margin:0 0 4px;color:${muted};font-size:13px;letter-spacing:.06em;text-transform:uppercase">SafeSight</p>
<p style="margin:0 0 12px">${esc(i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,")}</p>
${body}
<p style="margin:16px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:12px">${
    i.added ? "Log in to SafeSight" : "Create your account"
  }</a></p>
${foot}
</div></body></html>`;
}
