import { UserRoundPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeTa } from "@/lib/doubts/actions";
import { TaForm } from "./ta-form";

/**
 * Teaching assistants on the course page (teacher only). A TA answers the
 * course's questions and sees its overview — nothing else.
 */
export function CourseTas({ courseId, tas }: { courseId: string; tas: { userId: string; name: string; email: string }[] }) {
  return (
    <section aria-labelledby="tas-title" className="rounded-lg border bg-surface p-6">
      <h2 id="tas-title" className="text-title">
        Teaching assistants
      </h2>
      <p className="mb-4 text-small text-muted-foreground">
        TAs can answer students&apos; questions in this course and see its overview. They never see chats, scores or flags.
      </p>
      {tas.length ? (
        <ul className="mb-4 divide-y border-y">
          {tas.map((t) => (
            <li key={t.userId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-label">{t.name || t.email}</span>
                {t.name ? <span className="block truncate text-small text-muted-foreground">{t.email}</span> : null}
              </span>
              <form action={removeTa}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="userId" value={t.userId} />
                <Button type="submit" variant="ghost" size="icon" aria-label={`Remove ${t.name || t.email} as a teaching assistant`}>
                  <X aria-hidden="true" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 flex items-center gap-2 text-small text-muted-foreground">
          <UserRoundPlus className="size-4" strokeWidth={1.5} aria-hidden="true" />
          No teaching assistants yet.
        </p>
      )}
      <TaForm courseId={courseId} />
    </section>
  );
}
