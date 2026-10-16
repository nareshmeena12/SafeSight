import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// Placeholder home. The real landing page is built from design/landing in S10.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4">
      <header className="flex h-16 items-center">
        <Logo />
      </header>
      <section className="flex flex-1 flex-col items-start justify-center gap-6 py-16">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight sm:text-6xl">
          AI that teaches, not answers.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          SafeSight gives every student an AI that makes them think, and every
          teacher a clear view of how AI is used in their class.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
