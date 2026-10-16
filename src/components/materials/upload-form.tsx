"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIALS_BUCKET, MAX_PDF_BYTES } from "@/lib/materials/constants";
import { createClient } from "@/lib/supabase/client";

type State = { kind: "idle" } | { kind: "working"; step: string } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * Teacher PDF upload. The browser sends the file straight to Storage (the
 * bucket's row-level security checks the teacher owns the course), then asks
 * the server to read and index it.
 */
export function UploadForm({ courses }: { courses: { id: string; label: string }[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const working = state.kind === "working";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!courseId || !file) return setState({ kind: "error", message: "Choose a course and a PDF first." });
    if (file.type !== "application/pdf") return setState({ kind: "error", message: "Only PDF files can be added for now." });
    if (file.size > MAX_PDF_BYTES) return setState({ kind: "error", message: "This PDF is larger than 25 MB. Try splitting it." });

    setState({ kind: "working", step: "Uploading…" });
    const path = `${courseId}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await createClient()
      .storage.from(MATERIALS_BUCKET)
      .upload(path, file, { contentType: "application/pdf" });
    if (uploadError) {
      return setState({ kind: "error", message: "The upload didn't go through. Check your connection and try again." });
    }

    setState({ kind: "working", step: "Reading pages and preparing search…" });
    const res = await fetch("/api/materials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, title: title.trim() || file.name.replace(/\.pdf$/i, ""), path }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; pages?: number } | null;
    if (!res?.ok) {
      setState({ kind: "error", message: body?.error ?? "We couldn't read this PDF. Please try again." });
    } else {
      setState({ kind: "done", message: `Added. Sage can now search ${body?.pages ?? "its"} pages.` });
      setTitle("");
      setFile(null);
      (e.target as HTMLFormElement).reset();
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 rounded-lg border bg-surface p-6">
      <div className="grid gap-2">
        <Label htmlFor="material-course">Course</Label>
        <Select value={courseId} onValueChange={setCourseId} disabled={working}>
          <SelectTrigger id="material-course" className="w-full">
            <SelectValue placeholder="Choose a course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="material-title">Title</Label>
        <Input
          id="material-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Lecture 4 — First law for closed systems"
          maxLength={200}
          disabled={working}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="material-file">PDF (up to 25 MB)</Label>
        <Input
          id="material-file"
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={working}
          className="py-2 file:mr-3 file:h-full file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:text-label file:text-primary"
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={working || !file || !courseId}>
          <Upload aria-hidden="true" />
          {working ? state.step : "Add to course"}
        </Button>
        <p role="status" aria-live="polite" className={state.kind === "error" ? "text-small text-destructive" : "text-small text-muted-foreground"}>
          {state.kind === "done" || state.kind === "error" ? state.message : null}
        </p>
      </div>
    </form>
  );
}
