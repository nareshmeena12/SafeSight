"use client";

import { useActionState, useState } from "react";
import { Clock, Square, ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { endLabSession, extendLabSession, updateLabBlocklist } from "@/lib/lab/actions";
import type { FormState } from "@/lib/teacher/schemas";

/** End now (with a confirm step) and add 15 minutes. */
export function SessionActions({ sessionId, live }: { sessionId: string; live: boolean }) {
  const [ending, setEnding] = useState(false);
  return (
    <>
      <form action={extendLabSession}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="minutes" value="15" />
        <Button type="submit" variant="outline">
          <Clock aria-hidden="true" />
          Add 15 min
        </Button>
      </form>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive">
            <Square aria-hidden="true" />
            {live ? "End session" : "Cancel session"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{live ? "End the session now?" : "Cancel this session?"}</DialogTitle>
            <DialogDescription>
              {live
                ? "Recording stops on every lab PC within 10 seconds and AI sites are unblocked. Each student's summary is ready shortly after."
                : "The code stops working and nobody can join."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep it running</Button>
            </DialogClose>
            <form action={endLabSession} onSubmit={() => setEnding(true)}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <Button type="submit" variant="destructive" disabled={ending}>
                {ending ? "Ending…" : live ? "End session" : "Cancel session"}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const initial: FormState = { status: "idle" };

/** Change the teacher's extra blocked sites while the session runs. */
export function BlocklistDialog({ sessionId, blocklist }: { sessionId: string; blocklist: string[] }) {
  const [state, action, pending] = useActionState(updateLabBlocklist, initial);
  const error = state.fieldErrors?.blocklist ?? (state.status === "error" ? state.message : undefined);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldBan aria-hidden="true" />
          Blocked sites
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extra blocked sites</DialogTitle>
          <DialogDescription>
            AI sites (ChatGPT, Gemini, Claude, Copilot, DeepSeek, Perplexity and more) are always blocked. Add others
            here, one per line.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="sessionId" value={sessionId} />
          <div className="grid gap-2">
            <Label htmlFor="blocklist-edit">Sites</Label>
            <Textarea
              id="blocklist-edit"
              name="blocklist"
              rows={5}
              defaultValue={blocklist.join("\n")}
              aria-invalid={error ? true : undefined}
              aria-describedby="blocklist-edit-status"
            />
            <p
              id="blocklist-edit-status"
              role="status"
              className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            >
              {error ?? (state.status === "success" ? state.message : "")}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
