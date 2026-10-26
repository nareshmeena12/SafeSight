"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The invite as text to post in the class group or LMS when email isn't set up (or as well). */
export function ShareInvite({ text, emailReady }: { text: string; emailReady: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  }
  return (
    <section aria-labelledby="share-title" className="rounded-lg border bg-surface p-6">
      <h2 id="share-title" className="text-title">
        Share the invite
      </h2>
      <p className="mb-3 text-small text-muted-foreground">
        {emailReady
          ? "Post this in your class group too, for anyone not on the list."
          : "Email isn't set up yet, so post this in your class group. Students on your list join as soon as they sign up with that email."}
      </p>
      <pre className="whitespace-pre-wrap break-words rounded-md border bg-background p-4 font-sans text-small">{text}</pre>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy invite"}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Invite copied" : ""}
        </span>
      </div>
    </section>
  );
}
