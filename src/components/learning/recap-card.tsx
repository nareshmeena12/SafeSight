import { Markdown } from "@/components/sage/markdown";
import { Flashcards } from "./flashcards";

export type RecapView = { title: string; learned: string[]; flashcards: { front: string; back: string }[] };

/** "What you learned" and flashcards for one stretch of a Sage chat. */
export function RecapCard({ recap, note, headingLevel = 3 }: { recap: RecapView; note?: React.ReactNode; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="rounded-md border bg-background p-4">
      <H className="text-label">{recap.title}</H>
      {note ? <p className="text-small text-muted-foreground">{note}</p> : null}
      <p className="mt-3 text-small text-muted-foreground">What you learned</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-small">
        {recap.learned.map((l) => (
          <li key={l}>
            <Markdown>{l}</Markdown>
          </li>
        ))}
      </ul>
      {recap.flashcards.length ? (
        <>
          <p className="mt-4 mb-2 text-small text-muted-foreground">Flashcards</p>
          <Flashcards cards={recap.flashcards} />
        </>
      ) : null}
    </article>
  );
}
