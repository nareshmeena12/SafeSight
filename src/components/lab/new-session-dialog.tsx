"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/auth/field";
import { Field } from "@/components/auth/field";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLabSession } from "@/lib/lab/actions";
import type { FormState } from "@/lib/teacher/schemas";

const initial: FormState = { status: "idle" };

const durations = [
  { value: "60", label: "1 hour" },
  { value: "90", label: "1 hour 30 minutes" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
];

/** Next quarter hour in India time, as a datetime-local value. */
function nextQuarterHour(now: number) {
  const q = 15 * 60_000;
  const ist = new Date(Math.ceil(now / q) * q + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 16);
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Create a lab session: course, title, room, start, length and extra blocked sites. */
export function NewSessionDialog({
  courses,
  trigger,
}: {
  courses: { id: string; name: string; code: string }[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [defaultStart, setDefaultStart] = useState("");
  const [state, action, pending] = useActionState(createLabSession, initial);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDefaultStart(nextQuarterHour(Date.now()));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New lab session</DialogTitle>
          <DialogDescription>
            You get a 6-digit code. Students type it into the SafeSight Lab extension with their roll number.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="grid gap-5">
          <FormMessage message={state.status === "error" ? state.message : undefined} />
          <div className="grid gap-2">
            <Label htmlFor="courseId">Course</Label>
            <Select name="courseId" defaultValue={courses.length === 1 ? courses[0]!.id : undefined}>
              <SelectTrigger id="courseId" className="w-full" aria-invalid={errors.courseId ? true : undefined}>
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ErrorText id="courseId-error" message={errors.courseId} />
          </div>
          <Field name="title" label="Title" placeholder="Lab exam 2: heat exchangers" required error={errors.title} />
          <Field name="room" label="Room" placeholder="CAD Lab 2" hint="Optional." error={errors.room} />
          <div className="grid gap-5 sm:grid-cols-2">
            {defaultStart ? (
              <Field
                key={defaultStart}
                name="startsAt"
                label="Starts (India time)"
                type="datetime-local"
                defaultValue={defaultStart}
                required
                error={errors.startsAt}
              />
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="durationMinutes">Length</Label>
              <Select name="durationMinutes" defaultValue="120">
                <SelectTrigger id="durationMinutes" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durations.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ErrorText id="durationMinutes-error" message={errors.durationMinutes} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="blocklist">Extra blocked sites</Label>
            <Textarea
              id="blocklist"
              name="blocklist"
              rows={3}
              placeholder={"stackoverflow.com\ngeeksforgeeks.org"}
              aria-describedby="blocklist-hint"
              aria-invalid={errors.blocklist ? true : undefined}
            />
            {errors.blocklist ? (
              <ErrorText id="blocklist-error" message={errors.blocklist} />
            ) : (
              <p id="blocklist-hint" className="text-sm text-muted-foreground">
                Optional, one per line. ChatGPT, Gemini, Claude, Copilot, DeepSeek, Perplexity and other AI sites are
                always blocked.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
