import Link from "next/link";
import { cn } from "@/lib/utils";

/** The lens/aperture mark with a spark (design/logo/safesight-mark.svg). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6 shrink-0 text-primary", className)}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m14.31 8 5.74 9.94" />
      <path d="M9.69 8h11.48" />
      <path d="m7.38 12 5.74-9.94" />
      <path d="M9.69 16 3.95 6.06" />
      <path d="M14.31 16H2.83" />
      <path d="m16.62 12-5.74 9.94" />
      <path
        d="M12 9.7l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"
        fill="currentColor"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/** Mark plus the "SafeSight" wordmark in Geist semibold. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-md text-[17px] font-semibold tracking-tight text-foreground"
    >
      <LogoMark />
      SafeSight
    </Link>
  );
}
