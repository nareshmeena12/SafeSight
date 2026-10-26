"use client";

import { useActionState, useState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinQuiz, type JoinState } from "@/lib/brief/actions";

const initial: JoinState = { status: "idle" };

export function JoinQuizForm({ initialCode }: { initialCode: string }) {
  const [state, action, pending] = useActionState(joinQuiz, initial);
  // Controlled, so a mistyped code stays in the box to fix (forms reset after an action).
  const [code, setCode] = useState(initialCode);
  return (
    <form action={action} className="grid max-w-sm gap-3">
      <Label htmlFor="quiz-code">Code</Label>
      <Input
        id="quiz-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        className="h-14 font-mono text-[1.75rem] tracking-[0.3em]"
        aria-invalid={state.status === "error" ? true : undefined}
        aria-describedby={state.status === "error" ? "quiz-code-error" : undefined}
        autoFocus
        required
      />
      {state.status === "error" ? (
        <p id="quiz-code-error" role="alert" className="flex items-start gap-2 text-small text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join"}
        <ArrowRight aria-hidden="true" />
      </Button>
    </form>
  );
}
