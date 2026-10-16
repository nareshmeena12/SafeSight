"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newJoinCode } from "@/lib/teacher/actions";

/** The course's join code, large enough to read off a projector, with copy and reset. */
export function JoinCode({ courseId, code }: { courseId: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is on screen to read out instead.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-mono text-mono-stat tracking-[0.2em]" aria-label={`Join code ${code.split("").join(" ")}`}>
        {code}
      </p>
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <form
        action={newJoinCode}
        onSubmit={(e) => {
          if (!confirm("Make a new code? The old code stops working. Students already in the course stay in it.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="courseId" value={courseId} />
        <Button type="submit" variant="ghost">
          <RotateCcw aria-hidden="true" />
          New code
        </Button>
      </form>
      <span className="sr-only" aria-live="polite">
        {copied ? "Join code copied" : ""}
      </span>
    </div>
  );
}
