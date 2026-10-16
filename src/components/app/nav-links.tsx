"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, navigation, type Area } from "./nav";

/** The list of links for one app. Used by the sidebar and the mobile sheet. */
export function NavLinks({
  area,
  onNavigate,
  currentPath,
}: {
  area: Area;
  onNavigate?: () => void;
  /** Override for previews (the /design page). */
  currentPath?: string;
}) {
  const pathname = usePathname();
  const path = currentPath ?? pathname;
  const root = `/${area}`;

  return (
    <ul className="grid gap-1">
      {navigation[area].items.map(({ label, href, icon: Icon, soon }) => {
        const active = !soon && isActive(path, href, root);
        const base =
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-label transition-colors duration-150";
        return (
          <li key={href}>
            {soon ? (
              <span
                aria-disabled="true"
                className={cn(base, "cursor-default text-muted-foreground/70")}
              >
                <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
                {label}
                <span className="ml-auto rounded-full border px-2 text-eyebrow">Soon</span>
              </span>
            ) : (
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  base,
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
