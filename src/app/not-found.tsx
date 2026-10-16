import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <Logo href="/" />
      <p className="text-eyebrow text-muted-foreground uppercase">404</p>
      <h1 className="font-serif text-headline-sm">We couldn&apos;t find that page</h1>
      <p className="text-body text-muted-foreground">
        The link may be old, or the page may have moved. Let&apos;s get you back on track.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
