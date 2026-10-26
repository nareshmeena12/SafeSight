"use client";

import { useOptimistic, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setWeeklyEmail } from "@/lib/brief/actions";

/** "Email me the digest every Monday" (on by default). */
export function WeeklyEmailToggle({ on, email }: { on: boolean; email: string }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor="weekly-email">Email me the digest every Monday</Label>
        <p id="weekly-email-hint" className="text-small text-muted-foreground">
          Around 7:00 am India time, to <span className="break-all">{email}</span>.
        </p>
      </div>
      <Switch
        id="weekly-email"
        checked={optimistic}
        disabled={pending}
        aria-describedby="weekly-email-hint"
        onCheckedChange={(next) =>
          start(async () => {
            setOptimistic(next);
            const data = new FormData();
            if (next) data.set("weeklyEmail", "on");
            await setWeeklyEmail(data);
          })
        }
        className="mt-1"
      />
    </div>
  );
}
