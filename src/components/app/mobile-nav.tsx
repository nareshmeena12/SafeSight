"use client";

import { Menu } from "lucide-react";
import { Suspense, useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navigation, type Area } from "./nav";
import { NavLinks, NavList } from "./nav-links";

/** Menu button and slide-in navigation below the `lg` breakpoint. */
export function MobileNav({ area }: { area: Area }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu strokeWidth={1.5} className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="h-16 justify-center border-b px-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            {navigation[area].label} navigation
          </SheetDescription>
          <Logo href={`/${area}`} />
        </SheetHeader>
        <nav aria-label={`${navigation[area].label} navigation`} className="p-3">
          <Suspense fallback={<NavList area={area} path="" />}>
            <NavLinks area={area} onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
