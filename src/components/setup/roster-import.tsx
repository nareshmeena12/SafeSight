"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Send } from "lucide-react";
import { FormMessage } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importClassList, type ImportState } from "@/lib/setup/actions";
import { MAX_ROSTER_ROWS, parseRoster } from "@/lib/setup/roster";

const initial: ImportState = { status: "idle" };
const MAX_FILE_BYTES = 1024 * 1024;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Class list in: a CSV file or rows pasted from a spreadsheet (name, email,
 * roll number). The preview reads it the same way the server will; nothing is
 * sent until the teacher presses the button.
 */
export function RosterImport({ courseId, emailReady }: { courseId: string; emailReady: boolean }) {
  const [csv, setCsv] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: ImportState, formData: FormData) => {
    const result = await importClassList(prev, formData);
    if (result.status === "success") setCsv("");
    return result;
  }, initial);
  const preview = useMemo(() => (csv.trim() ? parseRoster(csv) : null), [csv]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError("That file is larger than 1 MB. Save it as CSV with just the student columns.");
    if (/\.xlsx?$/i.test(file.name)) return setFileError("That's an Excel file. In Excel, choose File → Save as → CSV, then pick the CSV here.");
    setCsv(await file.text());
  }

  const summary = state.status === "success" ? state.summary : undefined;

  return (
    <form action={action} className="grid gap-4 rounded-lg border bg-surface p-6" aria-labelledby="import-title">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <FileSpreadsheet className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="import-title" className="text-title">
            Import your class list
          </h2>
          <p className="text-small text-muted-foreground">
            Columns: name, email and roll number (any order, with or without a header). Up to {MAX_ROSTER_ROWS} students at once.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="roster-file">CSV file</Label>
        <Input
          id="roster-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFile}
          disabled={pending}
          aria-describedby={fileError ? "roster-file-error" : undefined}
          className="py-2 file:mr-3 file:h-full file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:text-label file:text-primary"
        />
        {fileError ? (
          <p id="roster-file-error" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="roster-csv">Or paste rows from a spreadsheet</Label>
        <Textarea
          id="roster-csv"
          name="csv"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          disabled={pending}
          className="font-mono text-small"
          placeholder={"Name, Email, Roll number\nRiya Sharma, riya.sharma@college.edu.in, ME23B001\nArjun Mehta, arjun.mehta@college.edu.in, ME23B002"}
        />
      </div>

      {preview ? (
        <div className="grid gap-3 rounded-md border p-4" aria-live="polite">
          <p className="text-label">
            {plural(preview.rows.length, "student", "students")} ready
            {preview.errors.length ? `, ${plural(preview.errors.length, "line", "lines")} to fix` : ""}
          </p>
          {preview.rows.length ? (
            <div className="max-h-64 overflow-auto rounded-sm border">
              <table className="w-full text-left text-small">
                <thead className="sticky top-0 bg-surface text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-normal">Name</th>
                    <th scope="col" className="px-3 py-2 font-normal">Email</th>
                    <th scope="col" className="hidden px-3 py-2 font-normal sm:table-cell">Roll number</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.email}>
                      <td className="px-3 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 font-mono sm:max-w-none">{r.email}</td>
                      <td className="hidden px-3 py-2 font-mono sm:table-cell">{r.rollNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 ? (
                <p className="border-t px-3 py-2 text-small text-muted-foreground">…and {preview.rows.length - 50} more</p>
              ) : null}
            </div>
          ) : null}
          {[...preview.errors, ...preview.warnings].length ? (
            <ul className="grid gap-1 text-small">
              {preview.errors.map((e) => (
                <li key={`e${e.line}`} className="text-destructive">
                  Line {e.line}: {e.message}
                </li>
              ))}
              {preview.warnings.map((w) => (
                <li key={`w${w.line}`} className="text-muted-foreground">
                  Line {w.line}: {w.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <FormMessage message={state.status === "error" ? state.message : undefined} />
      {summary ? (
        <div className="flex gap-3 rounded-md bg-primary-soft p-4" role="status">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <div className="grid gap-1 text-small">
            <p className="text-label">
              {[
                summary.invited ? `${plural(summary.invited, "student", "students")} invited` : null,
                summary.added ? `${plural(summary.added, "student", "students")} with an account added to the course` : null,
              ]
                .filter(Boolean)
                .join(", ") || "No new students in that list"}
              .
            </p>
            {summary.invited + summary.added ? (
              <p>
                {summary.emailing
                  ? "Emails are on their way; their status updates below."
                  : "Email isn't set up yet, so nothing was emailed. Share the invite text below with your class."}
              </p>
            ) : null}
            {summary.alreadyInvited || summary.alreadyInClass ? (
              <p className="text-muted-foreground">
                Skipped {[summary.alreadyInvited ? `${summary.alreadyInvited} already invited` : null, summary.alreadyInClass ? `${summary.alreadyInClass} already in the course` : null]
                  .filter(Boolean)
                  .join(" and ")}
                .
              </p>
            ) : null}
            {[...summary.skipped, ...summary.errors].map((e) => (
              <p key={`s${e.line}`} className="text-muted-foreground">
                Line {e.line}: {e.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending || !preview?.rows.length}>
          <Send aria-hidden="true" />
          {pending
            ? "Importing…"
            : preview?.rows.length
              ? `${emailReady ? "Invite" : "Add"} ${plural(preview.rows.length, "student", "students")}`
              : "Invite students"}
        </Button>
        <p className="text-small text-muted-foreground">
          {emailReady
            ? "Each student gets an email with a link to join. Students who already use SafeSight are added straight away."
            : "Students join when they sign up or log in with the email on your list. Students who already use SafeSight are added straight away."}
        </p>
      </div>
    </form>
  );
}
