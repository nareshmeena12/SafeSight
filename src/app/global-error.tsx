"use client";

import "./globals.css";

/** Last-resort fallback when the root layout itself fails. Keeps to plain markup. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
        <main className="grid max-w-md gap-4 text-center">
          <h1 className="text-title">SafeSight didn&apos;t load</h1>
          <p className="text-small text-muted-foreground">
            Something went wrong on our side. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mx-auto h-11 rounded-md bg-primary px-5 text-label text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
