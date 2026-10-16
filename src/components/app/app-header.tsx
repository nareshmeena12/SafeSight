import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";

/** Placeholder top bar for both apps. S2 replaces it with the full shell. */
export function AppHeader({ home }: { home: "/student" | "/teacher" }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4">
        <Logo href={home} />
        <Suspense fallback={<div className="h-5 w-32 animate-pulse rounded bg-muted" />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {user.fullName || user.email}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" className="h-11">
          <LogOut strokeWidth={1.5} aria-hidden="true" />
          Log out
        </Button>
      </form>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
