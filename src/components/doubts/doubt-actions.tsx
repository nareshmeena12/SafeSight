"use client";

import { Megaphone } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { announceFromDoubts, answerDoubt, type ActionState } from "@/lib/doubts/actions";

const idle: ActionState = { status: "idle" };

/** The reply box on one doubt in the queue. */
export function AnswerForm({ doubtId, current }: { doubtId: string; current: string }) {
  const [editing, setEditing] = useState(!current);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await answerDoubt(prev, formData);
    if (result.status === "success") setEditing(false);
    return result;
  }, idle);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {state.status === "success" ? (
          <p role="status" className="text-small text-good">
            {state.message}
          </p>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit answer
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="doubtId" value={doubtId} />
      <Label htmlFor={`answer-${doubtId}`} className="sr-only">
        Your answer
      </Label>
      <Textarea
        id={`answer-${doubtId}`}
        name="answer"
        defaultValue={current}
        rows={3}
        maxLength={4000}
        required
        placeholder="Explain the idea or the next step. The student sees this in SafeSight."
      />
      {state.status === "error" ? (
        <p role="alert" className="text-small text-critical">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : current ? "Update answer" : "Send answer"}
        </Button>
        {current ? (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** "N students asked something similar": answer them all as one class announcement. */
export function AnnounceDialog({
  courseId,
  doubtIds,
  students,
  suggestedTitle,
  questions,
}: {
  courseId: string;
  doubtIds: string[];
  students: number;
  suggestedTitle: string;
  questions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await announceFromDoubts(prev, formData);
    if (result.status === "success") setOpen(false);
    return result;
  }, idle);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Megaphone aria-hidden="true" />
          Answer as a class announcement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Answer the whole class</DialogTitle>
          <DialogDescription>
            {students} students asked something similar. Post one answer to everyone in the course; the {doubtIds.length} questions are marked answered and each student is told.
          </DialogDescription>
        </DialogHeader>
        <details className="rounded-md border px-3 py-2 text-small">
          <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">What they asked</summary>
          <ul className="grid gap-2 pb-2">
            {questions.map((q, i) => (
              <li key={i} className="border-l-2 pl-3">
                {q}
              </li>
            ))}
          </ul>
        </details>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="courseId" value={courseId} />
          {doubtIds.map((id) => (
            <input key={id} type="hidden" name="doubtIds" value={id} />
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="announce-title">Title</Label>
            <Input id="announce-title" name="title" defaultValue={suggestedTitle} maxLength={200} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="announce-body">Answer for the class</Label>
            <Textarea
              id="announce-body"
              name="body"
              rows={6}
              maxLength={6000}
              required
              placeholder="Explain the idea once, clearly. Names are never shown with an announcement."
            />
          </div>
          {state.status === "error" ? (
            <p role="alert" className="text-small text-critical">
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Posting…" : "Post to the class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
