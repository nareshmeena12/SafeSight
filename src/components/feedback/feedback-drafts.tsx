"use client";

import { useState } from "react";
import { CircleAlert, ClipboardCheck, PenLine, RefreshCw, Send, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { totalPoints, type Feedback, type FeedbackCriterion, type RubricCriterion } from "@/lib/feedback/rubric";
import { formatDateTime } from "@/lib/teacher/dates";

/**
 * "Draft feedback" on the replay page (S19): Lens drafts feedback per rubric
 * criterion; the teacher edits it and approves it. The student sees nothing
 * until it is approved, and the teacher can take it back.
 */
export function FeedbackDrafts({
  submissionId,
  studentName,
  initial,
  rubric,
  generalCriteria,
  configured,
  canEdit,
}: {
  submissionId: string;
  studentName: string;
  initial: Feedback | null;
  rubric: RubricCriterion[];
  generalCriteria: boolean;
  configured: boolean;
  canEdit: boolean;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(initial);
  const [criteria, setCriteria] = useState<FeedbackCriterion[]>(initial?.criteria ?? []);
  const [overall, setOverall] = useState(initial?.overall ?? "");
  const [busy, setBusy] = useState<null | "draft" | "save" | "approve" | "unshare">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const editing = criteria.length > 0;
  const approved = feedback?.status === "approved";
  const total = totalPoints(criteria);

  function load(f: Feedback) {
    setFeedback(f);
    setCriteria(f.criteria);
    setOverall(f.overall);
  }

  async function draft() {
    setBusy("draft");
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Lens couldn't draft feedback just now. Please try again.");
      load(body.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lens couldn't draft feedback just now.");
    } finally {
      setBusy(null);
    }
  }

  async function save(status: "draft" | "approved", kind: "save" | "approve" | "unshare") {
    setBusy(kind);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, criteria, overall, status }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "That didn't save. Please try again.");
      load(body.feedback);
      setSaved(
        kind === "approve"
          ? `Shared with ${studentName}.`
          : kind === "unshare"
            ? `Taken back. ${studentName} no longer sees it.`
            : status === "approved"
              ? `Saved. ${studentName} sees the updated feedback.`
              : "Draft saved. Only you see it.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  function writeYourself() {
    setCriteria(rubric.map((c) => ({ ...c, points: null, comment: "" })));
    setOverall("");
  }

  const update = (i: number, patch: Partial<FeedbackCriterion>) =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <section aria-labelledby="feedback-heading" className="grid gap-4 rounded-lg border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ClipboardCheck className="mt-1 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2 id="feedback-heading" className="flex flex-wrap items-center gap-2 text-title">
              Feedback
              {feedback ? (
                approved ? (
                  <Badge variant="good">Shared {feedback.approvedAt ? formatDateTime(feedback.approvedAt) : ""}</Badge>
                ) : (
                  <Badge variant="outline">Draft · only you see this</Badge>
                )
              ) : null}
            </h2>
            <p className="text-small text-muted-foreground">
              {generalCriteria
                ? "This assignment has no rubric, so feedback follows three general criteria. Add a rubric in the assignment's settings to use your own."
                : `Feedback per criterion from the assignment's rubric. ${studentName} sees nothing until you approve it.`}
            </p>
          </div>
        </div>
        {editing && canEdit && configured && !approved ? (
          <Button type="button" variant="ghost" onClick={draft} disabled={busy !== null}>
            <RefreshCw aria-hidden="true" />
            {busy === "draft" ? "Drafting…" : "Draft again"}
          </Button>
        ) : null}
      </div>

      <div aria-live="polite" className="grid gap-2">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-small text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {error}
          </p>
        ) : null}
        {saved ? <p className="text-small text-good">{saved}</p> : null}
      </div>

      {busy === "draft" && !editing ? (
        <div className="grid gap-3" aria-hidden="true">
          {rubric.map((c) => (
            <Skeleton key={c.criterion} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : null}

      {!editing && busy !== "draft" ? (
        <div className="grid gap-3">
          <ul className="grid gap-1 text-small text-muted-foreground">
            {rubric.map((c) => (
              <li key={c.criterion}>
                <span className="text-foreground">{c.criterion}</span>
                {c.maxPoints !== null ? <span className="font-mono text-mono"> ({c.maxPoints})</span> : null}
                {c.description ? ` — ${c.description}` : ""}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {configured ? (
                <Button type="button" onClick={draft}>
                  <ClipboardCheck aria-hidden="true" />
                  Draft feedback
                </Button>
              ) : null}
              <Button type="button" variant={configured ? "ghost" : "outline"} onClick={writeYourself}>
                <PenLine aria-hidden="true" />
                Write it yourself
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">No feedback yet. The course teacher can write it here.</p>
          )}
        </div>
      ) : null}

      {editing ? (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save(approved ? "approved" : "draft", "save");
          }}
        >
          <fieldset disabled={!canEdit || busy !== null} className="grid gap-4">
            {criteria.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label">{c.criterion}</p>
                    {c.description ? <p className="text-small text-muted-foreground">{c.description}</p> : null}
                  </div>
                  {c.maxPoints !== null ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`points-${i}`} className="sr-only">
                        Marks for {c.criterion}
                      </Label>
                      <Input
                        id={`points-${i}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={c.maxPoints}
                        step={0.5}
                        value={c.points ?? ""}
                        onChange={(e) => update(i, { points: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 font-mono"
                      />
                      <span className="font-mono text-mono text-muted-foreground">/ {c.maxPoints}</span>
                    </div>
                  ) : null}
                </div>
                <Label htmlFor={`comment-${i}`} className="sr-only">
                  Comment on {c.criterion}
                </Label>
                <Textarea
                  id={`comment-${i}`}
                  rows={3}
                  value={c.comment}
                  maxLength={2000}
                  onChange={(e) => update(i, { comment: e.target.value })}
                  placeholder="What works, and the most useful next step."
                />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="feedback-overall">Overall</Label>
              <Textarea
                id="feedback-overall"
                rows={3}
                value={overall}
                maxLength={4000}
                onChange={(e) => setOverall(e.target.value)}
                placeholder="What the work does well, and one thing to focus on next time."
              />
            </div>
            {total ? (
              <p className="text-small">
                Total <span className="font-mono text-mono">{total.points} / {total.max}</span>
              </p>
            ) : null}
          </fieldset>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {approved ? (
                <>
                  <Button type="submit" disabled={busy !== null}>
                    {busy === "save" ? "Saving…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy !== null} onClick={() => save("draft", "unshare")}>
                    <Undo2 aria-hidden="true" />
                    {busy === "unshare" ? "Taking back…" : "Take back to draft"}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" disabled={busy !== null} onClick={() => save("approved", "approve")}>
                    <Send aria-hidden="true" />
                    {busy === "approve" ? "Sharing…" : `Approve and share with ${studentName.split(" ")[0] || "student"}`}
                  </Button>
                  <Button type="submit" variant="outline" disabled={busy !== null}>
                    {busy === "save" ? "Saving…" : "Save draft"}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
