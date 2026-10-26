/**
 * The invite a student gets when their teacher imports the class list, and
 * the same text to share by hand when email isn't set up. Pure (no env reads),
 * so it is unit-tested.
 */

export type InviteEmailInput = {
  name: string;
  email: string;
  courseName: string;
  courseCode: string;
  teacherName: string;
  joinCode: string;
  siteUrl: string;
  /** The student already had an account and was added straight away. */
  added: boolean;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function courseLabel(i: Pick<InviteEmailInput, "courseName" | "courseCode">) {
  return i.courseCode ? `${i.courseCode} · ${i.courseName}` : i.courseName;
}

export function signupLink(siteUrl: string, email: string, joinCode: string) {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/signup?${new URLSearchParams({ email, code: joinCode }).toString()}`;
}

export function inviteSubject(i: InviteEmailInput) {
  return i.added ? `You're in ${courseLabel(i)} on SafeSight` : `Join ${courseLabel(i)} on SafeSight`;
}

export function inviteText(i: InviteEmailInput) {
  const hello = i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,";
  const teacher = i.teacherName || "Your teacher";
  const base = i.siteUrl.replace(/\/$/, "");
  if (i.added) {
    return [
      hello,
      "",
      `${teacher} has added you to ${courseLabel(i)} on SafeSight. Log in with ${i.email} and you'll find it on your home page:`,
      `${base}/login`,
      "",
      "SafeSight's tutor, Sage, helps you work through problems step by step.",
    ].join("\n");
  }
  return [
    hello,
    "",
    `${teacher} has invited you to ${courseLabel(i)} on SafeSight, where Sage helps you work through problems step by step.`,
    "",
    `Create your account with this email (${i.email}) and you'll join the course straight away:`,
    signupLink(base, i.email, i.joinCode),
    "",
    `Already have an account? Log in with this email, or join with the class code ${i.joinCode} at ${base}/student/join`,
  ].join("\n");
}

export function inviteHtml(i: InviteEmailInput) {
  const base = i.siteUrl.replace(/\/$/, "");
  const primary = "#1F6F5C";
  const muted = "#6B6F7B";
  const link = i.added ? `${base}/login` : signupLink(base, i.email, i.joinCode);
  const button = `<p style="margin:16px 0"><a href="${esc(link)}" style="display:inline-block;background:${primary};color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:12px">${
    i.added ? "Log in to SafeSight" : "Create your account"
  }</a></p>`;
  const body = i.added
    ? `<p style="margin:0 0 8px">${esc(i.teacherName || "Your teacher")} has added you to <strong>${esc(courseLabel(i))}</strong>. Log in with ${esc(i.email)} and you'll find it on your home page.</p>`
    : `<p style="margin:0 0 8px">${esc(i.teacherName || "Your teacher")} has invited you to <strong>${esc(courseLabel(i))}</strong> on SafeSight, where Sage helps you work through problems step by step.</p>
<p style="margin:0 0 8px">Create your account with this email (${esc(i.email)}) and you'll join the course straight away.</p>`;
  const foot = i.added
    ? ""
    : `<p style="margin:0;color:${muted};font-size:14px">Already have an account? Log in with this email, or join with the class code <span style="font-family:'Geist Mono',monospace;letter-spacing:.1em">${esc(i.joinCode)}</span>.</p>`;
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FAF8F3;color:#14161F;font-family:Geist,Inter,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:560px;margin:0 auto;border:1px solid #E7E3DA;border-radius:16px;padding:24px;background:#FFFFFF">
<p style="margin:0 0 4px;color:${muted};font-size:13px;letter-spacing:.06em;text-transform:uppercase">SafeSight</p>
<p style="margin:0 0 12px">${esc(i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,")}</p>
${body}
${button}
${foot}
</div></body></html>`;
}

/** One message for the whole class (class group, LMS), when email isn't set up or as well. */
export function classInviteText(i: Pick<InviteEmailInput, "courseName" | "courseCode" | "teacherName" | "joinCode" | "siteUrl">) {
  const base = i.siteUrl.replace(/\/$/, "");
  return [
    `Join ${courseLabel(i)} on SafeSight${i.teacherName ? ` (${i.teacherName})` : ""}.`,
    `Sign up with your college email: ${base}/signup?code=${encodeURIComponent(i.joinCode)}`,
    `Already have an account? Join here: ${base}/student/join?code=${encodeURIComponent(i.joinCode)} (class code ${i.joinCode}).`,
  ].join("\n");
}
