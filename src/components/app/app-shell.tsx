import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { MobileNav } from "./mobile-nav";
import { navigation, type Area } from "./nav";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

/**
 * The frame for the student and teacher apps: a sidebar from `lg` up, a top
 * bar with the menu button (below `lg`) and the account menu, and a 1200px
 * content column. Pages put a <PageHeader> first.
 */
export function AppShell({ area, children }: { area: Area; children: React.ReactNode }) {
  const label = navigation[area].label;
  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Logo href={`/${area}`} />
        </div>
        <nav aria-label={`${label} navigation`} className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pt-2 pb-2 text-eyebrow text-muted-foreground uppercase">{label}</p>
          <NavLinks area={area} />
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-2 sm:px-4 lg:px-8">
            <MobileNav area={area} />
            <div className="lg:hidden">
              <Logo href={`/${area}`} />
            </div>
            <div className="ml-auto">
              <Suspense fallback={<Skeleton className="h-9 w-36 rounded-md" />}>
                <AccountMenu />
              </Suspense>
            </div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenu user={user} signOut={signOut} />;
}
