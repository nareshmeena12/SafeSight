"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardPaste, FileUp, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MATERIALS_BUCKET, MAX_PDF_BYTES } from "@/lib/materials/constants";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type State = { kind: "idle" } | { kind: "working"; step: string } | { kind: "error"; message: string };

/**
 * Syllabus in: upload the PDF (straight to the course's private Storage
 * folder) or paste the text. The server reads units, topics and course
 * outcomes into a draft topic map; the page then shows it for review.
 */
export function SyllabusInput({ courseId, hasMap, aiReady }: { courseId: string; hasMap: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pdf" | "text">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const working = state.kind === "working";

  async function read(body: object) {
    setState({ kind: "working", step: "Reading the syllabus… this takes about 20 seconds" });
    const res = await fetch("/api/setup/syllabus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, ...body }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) return setState({ kind: "error", message: data?.error ?? "We couldn't read the syllabus. Please try again." });
    setState({ kind: "idle" });
    setFile(null);
    setText("");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tab === "text") {
      if (!text.trim()) return setState({ kind: "error", message: "Paste the syllabus text first." });
      return read({ text });
    }
    if (!file) return setState({ kind: "error", message: "Choose the syllabus PDF first." });
    if (file.type !== "application/pdf") return setState({ kind: "error", message: "Only PDF files can be read. Or paste the text instead." });
    if (file.size > MAX_PDF_BYTES) return setState({ kind: "error", message: "This PDF is larger than 25 MB. Paste the text instead." });
    setState({ kind: "working", step: "Uploading…" });
    const path = `${courseId}/${crypto.randomUUID()}.pdf`;
    const { error } = await createClient().storage.from(MATERIALS_BUCKET).upload(path, file, { contentType: "application/pdf" });
    if (error) return setState({ kind: "error", message: "The upload didn't go through. Check your connection and try again." });
    await read({ path, fileName: file.name });
  }

  const tabs = [
    { value: "pdf", label: "Upload PDF", Icon: FileUp },
    { value: "text", label: "Paste text", Icon: ClipboardPaste },
  ] as const;

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border bg-surface p-6" aria-labelledby="syllabus-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <ScrollText className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="syllabus-title" className="text-title">
            {hasMap ? "Read a new syllabus" : "Start with your syllabus"}
          </h2>
          <p className="text-small text-muted-foreground">
            SafeSight picks out the units, topics and course outcomes. You check and edit them before anything is saved.
          </p>
        </div>
      </div>

      {!aiReady ? (
        <p className="rounded-md border border-dashed p-4 text-small text-muted-foreground">
          Reading a syllabus needs SafeSight&apos;s AI model, which isn&apos;t set up yet. You can still type your units and
          topics into the topic map below.
        </p>
      ) : (
        <>
          <div role="group" aria-label="How to add the syllabus" className="grid grid-cols-2 gap-1 rounded-md border p-1 sm:max-w-sm">
            {tabs.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                disabled={working}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-sm px-3 text-label transition-colors duration-150 ease-out",
                  tab === value ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover",
                )}
              >
                <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {tab === "pdf" ? (
            <div className="grid gap-2">
              <Label htmlFor="syllabus-file">Syllabus PDF (up to 25 MB)</Label>
              <Input
                id="syllabus-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={working}
                className="py-2 file:mr-3 file:h-full file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:text-label file:text-primary"
              />
              <p className="text-small text-muted-foreground">A scanned copy won&apos;t work; paste the text instead.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="syllabus-text">Syllabus text</Label>
              <Textarea
                id="syllabus-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={working}
                placeholder={"UNIT I — Basic concepts: systems, properties, zeroth law…\nUNIT II — First law…\n\nCourse outcomes\nCO1: Apply the first law to closed systems"}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={working || (tab === "pdf" ? !file : !text.trim())}>
              {working ? "Reading…" : "Read syllabus"}
            </Button>
            <p
              role="status"
              aria-live="polite"
              className={state.kind === "error" ? "text-small text-destructive" : "text-small text-muted-foreground"}
            >
              {state.kind === "error" ? state.message : state.kind === "working" ? state.step : null}
            </p>
          </div>
        </>
      )}
    </form>
  );
}
