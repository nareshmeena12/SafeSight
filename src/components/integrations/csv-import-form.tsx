"use client";

import { useActionState, useMemo, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { ErrorNote } from "./notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importMoodleCsv, type LmsImportState } from "@/lib/integrations/actions";
import { parseRoster } from "@/lib/setup/roster";
import { ImportResult } from "./import-result";
import { TargetFields, type CourseOption } from "./target-fields";

const initial: LmsImportState = { status: "idle" };
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Moodle's CSV export (Participants → select all → "Download table data as
 * CSV", or the "Upload users" file). Read in the browser for a preview with
 * the same parser the server uses; teachers and other roles are left out.
 */
export function CsvImportForm({ courses }: { courses: CourseOption[] }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: LmsImportState, formData: FormData) => {
    const result = await importMoodleCsv(prev, formData);
    if (result.status === "success") {
      setCsv("");
      setFileName("");
    }
    return result;
  }, initial);
  const preview = useMemo(() => (csv.trim() ? parseRoster(csv) : null), [csv]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError("That file is larger than 2 MB. Export just the participants of one course.");
    if (/\.(xlsx?|ods)$/i.test(file.name)) return setFileError("That's a spreadsheet file. In Moodle, choose “Comma separated values (.csv)” when you download.");
    setFileName(file.name.replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim());
    setCsv(await file.text());
  }

  return (
    <form action={action} className="grid gap-4" aria-labelledby="csv-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <FileSpreadsheet className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="csv-title" className="text-title">
            Upload Moodle&apos;s CSV export
          </h2>
          <p className="text-small text-muted-foreground">
            In your Moodle course: Participants → select all → “Download table data as” → CSV. Teachers and other roles in the file are left out.
          </p>
        </div>
      </div>
      <input type="hidden" name="csv" value={csv} />
      <div className="grid gap-2">
        <Label htmlFor="moodle-csv">CSV file</Label>
        <Input
          id="moodle-csv"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFile}
          disabled={pending}
          aria-describedby={fileError ? "moodle-csv-error" : undefined}
          className="py-2 file:mr-3 file:h-full file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:text-label file:text-primary"
        />
        {fileError ? (
          <p id="moodle-csv-error" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
      </div>
      {preview ? (
        <div className="grid gap-2 rounded-md border p-4 text-small" aria-live="polite">
          <p className="text-label">
            {preview.rows.length} {preview.rows.length === 1 ? "student" : "students"} found
            {preview.errors.length ? `, ${preview.errors.length} ${preview.errors.length === 1 ? "line" : "lines"} we couldn't read` : ""}
          </p>
          {[...preview.errors, ...preview.warnings].slice(0, 6).map((w) => (
            <p key={`${w.line}${w.message}`} className="text-muted-foreground">
              Line {w.line}: {w.message}
            </p>
          ))}
        </div>
      ) : null}
      {preview?.rows.length ? <TargetFields key={fileName} idPrefix="moodle-csv" courses={courses} defaultName={fileName} disabled={pending} /> : null}
      <ErrorNote message={state.status === "error" ? state.message : undefined} />
      {state.status === "success" && state.summary && state.courseId ? (
        <ImportResult summary={state.summary} courseId={state.courseId} created={state.created} />
      ) : null}
      <div>
        <Button type="submit" disabled={pending || !preview?.rows.length}>
          <Upload aria-hidden="true" />
          {pending ? "Importing…" : preview?.rows.length ? `Import ${preview.rows.length} ${preview.rows.length === 1 ? "student" : "students"}` : "Import students"}
        </Button>
      </div>
    </form>
  );
}
