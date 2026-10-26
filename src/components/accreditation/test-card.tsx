"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteTest, saveTest, type ActionResult } from "@/lib/accreditation/actions";
import type { CourseTest } from "@/lib/accreditation/data";
import { expandLabels, MAX_QUESTIONS } from "@/lib/accreditation/marks";
import { formatNumber } from "@/lib/accreditation/attainment";
import { CoChips } from "./co-chips";
import { MarksImport, type RosterEntry } from "./marks-import";
import { StatusNote } from "./status-note";

type Outcome = { id: string; code: string; description: string };
type QuestionDraft = { key: number; id?: string; label: string; maxMarks: string; outcomeIds: string[] };

const toDrafts = (test: CourseTest | null): QuestionDraft[] =>
  test?.questions.length
    ? test.questions.map((q, i) => ({ key: i, id: q.id, label: q.label, maxMarks: String(q.maxMarks), outcomeIds: q.outcomeIds }))
    : [];

function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** A test or exam: its questions (marks out of, COs per question) and its imported marks. `test` null = a new one. */
export function TestCard({
  courseId,
  test,
  outcomes,
  marks,
  roster,
  onDone,
}: {
  courseId: string;
  test: CourseTest | null;
  outcomes: Outcome[];
  marks?: { rows: number; absent: number; matched: number };
  roster: RosterEntry[];
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(test === null);
  const [importing, setImporting] = useState(false);
  const [title, setTitle] = useState(test?.title ?? "");
  const [heldOn, setHeldOn] = useState(test?.heldOn ?? "");
  const [weight, setWeight] = useState(String(test?.weight ?? 1));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => toDrafts(test));
  const nextKey = useRef(Math.max(1, questions.length));
  const [quick, setQuick] = useState("Q1-Q5");
  const [quickMax, setQuickMax] = useState("10");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<QuestionDraft>) => setQuestions((list) => list.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const addQuick = () => {
    const labels = expandLabels(quick).filter((l) => !questions.some((q) => q.label.toLowerCase() === l.toLowerCase()));
    setQuestions((list) => [...list, ...labels.map((label) => ({ key: nextKey.current++, label, maxMarks: quickMax, outcomeIds: [] }))].slice(0, MAX_QUESTIONS));
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveTest({
        courseId,
        testId: test?.id,
        title,
        heldOn,
        weight: Number(weight),
        questions: questions.map((q) => ({ id: q.id, label: q.label, maxMarks: Number(q.maxMarks), outcomeIds: q.outcomeIds })),
      });
      setStatus(result);
      if (result.status === "success") {
        setEditing(false);
        onDone?.();
      }
    });

  const remove = () => {
    if (!test || !window.confirm(`Remove ${test.title} and its imported marks?`)) return;
    startTransition(async () => setStatus(await deleteTest({ courseId, testId: test.id })));
  };

  const total = (test?.questions ?? []).reduce((n, q) => n + q.maxMarks, 0);
  const code = new Map(outcomes.map((o) => [o.id, o.code]));

  if (!editing && test) {
    return (
      <li className="grid gap-4 rounded-lg border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-label">{test.title}</h3>
            <p className="mt-1 text-small text-muted-foreground">
              {[
                test.heldOn ? formatDay(test.heldOn) : null,
                `${test.questions.length} ${test.questions.length === 1 ? "question" : "questions"}, ${formatNumber(total)} marks`,
                `weight ${formatNumber(test.weight)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`Edit ${test.title}`} title="Edit">
              <Pencil aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={remove} disabled={pending} aria-label={`Remove ${test.title}`} title="Remove">
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
        <ul className="flex flex-wrap gap-2 text-small">
          {test.questions.map((q) => (
            <li key={q.id} className="rounded-md border px-2 py-1">
              <span className="font-mono">{q.label}</span> <span className="text-muted-foreground">/{formatNumber(q.maxMarks)}</span>{" "}
              <span className="font-mono text-primary">{q.outcomeIds.map((id) => code.get(id)).filter(Boolean).join(" ") || "no CO"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
          <p className="text-small text-muted-foreground sm:mr-auto">
            {marks?.rows
              ? `Marks for ${marks.rows} ${marks.rows === 1 ? "student" : "students"}${marks.absent ? ` (${marks.absent} absent)` : ""}; ${marks.matched} linked to students in the course.`
              : "No marks yet."}
          </p>
          <Button type="button" variant={marks?.rows ? "outline" : "default"} onClick={() => setImporting((v) => !v)} aria-expanded={importing}>
            <Upload aria-hidden="true" />
            {marks?.rows ? "Import again" : "Import marks"}
          </Button>
        </div>
        {importing ? <MarksImport courseId={courseId} test={test} roster={roster} hasMarks={Boolean(marks?.rows)} onDone={() => setImporting(false)} /> : null}
        <StatusNote status={status} />
      </li>
    );
  }

  const id = test?.id ?? "new";
  return (
    <li className="grid gap-5 rounded-lg border bg-surface p-5">
      <h3 className="text-label">{test ? `Edit ${test.title}` : "New test or exam"}</h3>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem_7rem]">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-title`}>Name</Label>
          <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mid-semester test 1" maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-date`}>Held on</Label>
          <Input id={`${id}-date`} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-weight`}>Weight</Label>
          <Input id={`${id}-weight`} type="number" inputMode="decimal" min={0} max={10} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-label">Questions</legend>
        {questions.length ? (
          <ol className="grid gap-3">
            {questions.map((q, i) => (
              <li key={q.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[6rem_6rem_1fr_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-q${q.key}-label`}>Question</Label>
                  <Input id={`${id}-q${q.key}-label`} value={q.label} onChange={(e) => update(q.key, { label: e.target.value })} maxLength={16} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-q${q.key}-max`}>Out of</Label>
                  <Input
                    id={`${id}-q${q.key}-max`}
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    step={0.5}
                    value={q.maxMarks}
                    onChange={(e) => update(q.key, { maxMarks: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-small text-muted-foreground">COs</span>
                  <CoChips outcomes={outcomes} selected={q.outcomeIds} onChange={(ids) => update(q.key, { outcomeIds: ids })} label={`COs for question ${i + 1}`} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuestions((list) => list.filter((x) => x.key !== q.key))}
                  aria-label={`Remove question ${q.label || i + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-quick`}>Add questions</Label>
            <Input id={`${id}-quick`} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Q1-Q5, Q6a, Q6b" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-quick-max`}>Out of</Label>
            <Input id={`${id}-quick-max`} type="number" inputMode="decimal" min={0.5} step={0.5} value={quickMax} onChange={(e) => setQuickMax(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={addQuick} disabled={questions.length >= MAX_QUESTIONS}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
        <p className="text-small text-muted-foreground">
          Map each question to the CO it tests. Labels must match the column names in your marks file (Q1, Q2a …). Editing a question keeps its marks.
        </p>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <StatusNote status={status} className="sm:mr-auto" />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (test) {
              setEditing(false);
              setQuestions(toDrafts(test));
              setTitle(test.title);
              setHeldOn(test.heldOn ?? "");
              setWeight(String(test.weight));
            }
            onDone?.();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending || !title.trim() || !questions.length}>
          {pending ? "Saving…" : "Save test"}
        </Button>
      </div>
    </li>
  );
}

/** "Add a test or exam" and the form for it. */
export function NewTest(props: { courseId: string; outcomes: Outcome[]; roster: RosterEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={!props.outcomes.length}>
          <Plus aria-hidden="true" />
          Add a test or exam
        </Button>
      </div>
    );
  }
  return (
    <ul>
      <TestCard {...props} test={null} onDone={() => setOpen(false)} />
    </ul>
  );
}
