"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies a ready-made text (an invite to share by hand). */
export function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing else to do here.
    }
  }
  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={label} title={label}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
