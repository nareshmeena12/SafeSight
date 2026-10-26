"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clearMarks, importMarks, type ImportMarksResult } from "@/lib/accreditation/actions";
import type { CourseTest } from "@/lib/accreditation/data";
import { marksTemplate, parseMarks } from "@/lib/accreditation/marks";
import { StatusNote } from "./status-note";

export type RosterEntry = { rollNumber: string | null; email: string; name: string };

/**
 * Question-wise marks from a spreadsheet (CSV, or pasted from Excel). The
 * preview reads the file with the same parser as the server; importing
 * replaces the test's marks.
 */
export function MarksImport({
  courseId,
  test,
  roster,
  hasMarks,
  onDone,
}: {
  courseId: string;
  test: CourseTest;
  roster: RosterEntry[];
  hasMarks: boolean;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportMarksResult | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = useMemo(() => (text.trim() ? parseMarks(text, test.questions) : null), [text, test.questions]);

  function download() {
    const csv = marksTemplate(test.questions, roster);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${test.title.replace(/[^\w-]+/g, "-").slice(0, 60) || "marks"}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file: File) {
    if (/\.xlsx?$/i.test(file.name)) {
      setResult({ status: "error", message: "Save the sheet as CSV first (File → Save as → CSV), or copy the cells and paste them here." });
      return;
    }
    setText(await file.text());
    setResult(null);
  }

  const run = () =>
    startTransition(async () => {
      const r = await importMarks({ courseId, testId: test.id, text });
      setResult(r);
      if (r.status === "success") setText("");
    });

  const clear = () => {
    if (!window.confirm(`Clear all marks for ${test.title}?`)) return;
    startTransition(async () => setResult(await clearMarks({ courseId, testId: test.id })));
  };

  const id = `marks-${test.id}`;
  return (
    <div className="grid gap-4 rounded-md border p-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={download}>
          <Download aria-hidden="true" />
          Download template
        </Button>
        <Button type="button" variant="outline" asChild>
          <label htmlFor={`${id}-file`} className="cursor-pointer">
            <FileUp aria-hidden="true" />
            Choose a CSV file
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,text/csv,.txt,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        {hasMarks ? (
          <Button type="button" variant="ghost" onClick={clear} disabled={pending}>
            Clear marks
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-text`}>Or paste the marks</Label>
        <Textarea
          id={`${id}-text`}
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder={`Roll number,Name,${test.questions.map((q) => q.label).join(",")}\nME23B001,Riya Sharma,${test.questions.map(() => "").join(",")}`}
          className="font-mono text-small"
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-small text-muted-foreground">
          One row per student: roll number (or email), then one column per question named like the question. Leave a cell blank if not attempted; write AB for absent.
        </p>
      </div>

      {preview ? (
        <div className="grid gap-1 text-small" aria-live="polite">
          <p>
            <span className="font-mono">{preview.rows.length}</span> {preview.rows.length === 1 ? "student" : "students"} ready
            {preview.rows.some((r) => r.absent) ? ` (${preview.rows.filter((r) => r.absent).length} absent)` : ""}
            {preview.matchedQuestions.length ? ` · columns: ${preview.matchedQuestions.join(", ")}` : ""}
          </p>
          {[...preview.errors.slice(0, 5)].map((e) => (
            <p key={`e${e.line}${e.message}`} className="text-destructive">
              Row {e.line}: {e.message}
            </p>
          ))}
          {preview.errors.length > 5 ? <p className="text-destructive">…and {preview.errors.length - 5} more rows with problems.</p> : null}
          {preview.warnings.slice(0, 3).map((w) => (
            <p key={`w${w.line}${w.message}`} className="text-muted-foreground">
              {w.message}
            </p>
          ))}
        </div>
      ) : null}

      {result?.status === "success" && result.imported !== undefined ? (
        <div className="grid gap-1 rounded-md bg-primary-soft p-3 text-small">
          <p>
            {result.message} {result.matched} linked to students in this course.
          </p>
          {result.unmatched?.length ? (
            <p className="text-muted-foreground">
              Not in the course (kept, counted in attainment): {result.unmatched.join(", ")}
              {result.imported! - result.matched! > result.unmatched.length ? " …" : ""}
            </p>
          ) : null}
          {result.errors?.length ? <p className="text-muted-foreground">{result.errors.length} rows were skipped (see the preview).</p> : null}
        </div>
      ) : (
        <StatusNote status={result} />
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Close
        </Button>
        <Button type="button" onClick={run} disabled={pending || !preview?.rows.length}>
          {pending ? "Importing…" : hasMarks ? "Replace marks" : "Import marks"}
        </Button>
      </div>
    </div>
  );
}
