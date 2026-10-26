"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTa, type ActionState } from "@/lib/doubts/actions";

const idle: ActionState = { status: "idle" };

export function TaForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(addTa, idle);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <Label htmlFor="ta-email">Add by email</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="ta-email" name="email" type="email" autoComplete="off" placeholder="arjun.mehta@college.edu" required className="sm:flex-1" />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add TA"}
        </Button>
      </div>
      <p className="text-small text-muted-foreground">They need a SafeSight account first (student or teacher).</p>
      {state.status !== "idle" ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-small text-critical" : "text-small text-good"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
