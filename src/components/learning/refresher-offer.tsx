import { PracticeButton } from "./practice-button";

/** Shown under a Sage reply when the student keeps struggling on a topic. */
export function RefresherOffer({ courseId, topic }: { courseId: string; topic: string }) {
  return (
    <div className="mt-3 rounded-md border bg-primary-soft/50 p-4">
      <p className="text-label">This one keeps coming up — that&apos;s normal.</p>
      <p className="mt-1 text-small text-muted-foreground">
        Often a basic skill underneath <span className="text-foreground">{topic}</span> is what&apos;s getting in the way. Try
        a 5-minute refresher with 2 quick checks.
      </p>
      <PracticeButton courseId={courseId} topic={topic} kind="refresher" source="sage" label="Start the refresher" size="sm" className="mt-3 block" />
    </div>
  );
}
