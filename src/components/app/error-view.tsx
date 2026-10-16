"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, CloudOff } from "lucide-react";
import { EmptyState } from "@/components/product/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Friendly fallback for an app page that failed to load. The message never
 * shows technical details (production errors are redacted anyway); the
 * digest goes to the console so it can be matched with the server logs.
 */
export function ErrorView({ error, retry, home }: { error: unknown; retry: () => void; home: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <EmptyState
      icon={CloudOff}
      title="This page didn't load"
      description={
        <>
          Something went wrong on our side, not yours. Try again in a moment — your work is saved.
          {digest ? <span className="mt-2 block font-mono text-mono">Reference {digest}</span> : null}
        </>
      }
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href={home}>Go to home</Link>
          </Button>
        </div>
      }
    />
  );
}
