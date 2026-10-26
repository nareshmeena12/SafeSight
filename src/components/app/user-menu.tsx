"use client";

import { Building2, ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UserMenuUser = { fullName: string; email: string; role: string };

export function initials(name: string, fallback = "?"): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

const roleLabel: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Admin",
};

/**
 * Avatar button with the user's name, role and a log-out action.
 * `signOut` is passed in so this stays usable in previews.
 */
export function UserMenu({
  user,
  signOut,
}: {
  user: UserMenuUser;
  signOut?: () => Promise<void>;
}) {
  const name = user.fullName || user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 items-center gap-2 rounded-md px-2 text-label transition-colors hover:bg-hover">
        <Avatar>
          <AvatarFallback>{initials(user.fullName, user.email[0]?.toUpperCase())}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">Account menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 px-2 py-2">
          <span className="truncate text-label text-foreground">{name}</span>
          {user.fullName ? (
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          ) : null}
          <span className="mt-1 font-mono text-xs font-normal text-muted-foreground">
            {roleLabel[user.role] ?? user.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "admin" ? (
          // S23: admins have the institution dashboard and may also teach.
          <>
            <DropdownMenuItem asChild className="min-h-11">
              <Link href="/admin">
                <Building2 strokeWidth={1.5} aria-hidden="true" />
                Institution
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="min-h-11">
              <Link href="/teacher">
                <LayoutDashboard strokeWidth={1.5} aria-hidden="true" />
                Teaching
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {signOut ? (
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="min-h-11 w-full">
                <LogOut strokeWidth={1.5} aria-hidden="true" />
                Log out
              </button>
            </DropdownMenuItem>
          </form>
        ) : (
          <DropdownMenuItem className="min-h-11">
            <LogOut strokeWidth={1.5} aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
