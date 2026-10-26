import Link from "next/link";
import { ArrowRight, HandHelping } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { unreadNotifications } from "@/lib/doubts/data";
import { createClient } from "@/lib/supabase/server";

/**
 * S21: "Your teacher answered your question" on a home page, while the
 * user has unread notices. Renders nothing otherwise.
 */
export async function DoubtNotices() {
  const user = await getCurrentUser();
  if (!user) return null;
  const notices = await unreadNotifications(await createClient(), user.id);
  if (!notices.length) return null;
  const latest = notices[0];
  const more = notices.length - 1;
  return (
    <Link
      href={latest.link || "/student/doubts"}
      className="mb-6 flex items-center gap-4 rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out hover:bg-hover"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
        <HandHelping className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label">{latest.title}</span>
        <span className="block truncate text-small text-muted-foreground">
          {latest.body}
          {more > 0 ? ` · and ${more} more` : ""}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}
