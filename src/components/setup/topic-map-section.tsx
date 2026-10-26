"use client";

import { useState } from "react";
import { FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discardSyllabusDraft } from "@/lib/setup/actions";
import type { TopicMapView } from "@/lib/setup/server";
import type { TopicMapDraft } from "@/lib/setup/topic-map";
import { TopicMapEditor } from "./topic-map-editor";

/** The saved topic map with linked notes, an editor, and the draft read from a syllabus waiting for review. */
export function TopicMapSection({
  courseId,
  course,
  saved,
  draft,
  draftFrom,
  draftKey,
}: {
  courseId: string;
  course: { name: string; code: string };
  saved: TopicMapView;
  draft: TopicMapDraft | null;
  draftFrom: string;
  /** Changes when a new syllabus is read, so the editor starts again from it. */
  draftKey: string;
}) {
  const [editing, setEditing] = useState(false);
  const hasMap = saved.units.length > 0;
  const savedDraft: TopicMapDraft = {
    courseName: course.name,
    courseCode: course.code,
    units: saved.units.map((u) => ({ title: u.title, topics: u.topics.map((t) => t.title) })),
    outcomes: saved.outcomes.map((o) => ({ code: o.code, description: o.description })),
  };

  if (draft) {
    return (
      <section aria-labelledby="map-title" className="rounded-lg border bg-surface p-6">
        <h2 id="map-title" className="text-title">
          Check what we read
        </h2>
        <TopicMapEditor
          key={draftKey}
          courseId={courseId}
          initialMap={{
            ...draft,
            courseName: draft.courseName || course.name,
            courseCode: draft.courseCode || course.code,
          }}
          intro={
            <div className="flex flex-col gap-3 rounded-md bg-primary-soft p-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-small text-foreground">
                From {draftFrom}. Fix anything that looks off, then save. {hasMap ? "Saving replaces your current topic map." : ""}
              </p>
              {hasMap ? (
                <Button type="submit" variant="outline" size="sm" formAction={discardSyllabusDraft} formNoValidate name="courseId" value={courseId}>
                  Keep my current map
                </Button>
              ) : null}
            </div>
          }
        />
      </section>
    );
  }

  if (!hasMap || editing) {
    return (
      <section aria-labelledby="map-title" className="rounded-lg border bg-surface p-6">
        <h2 id="map-title" className="text-title">
          {hasMap ? "Edit topic map" : "Or type the topic map yourself"}
        </h2>
        <p className="mb-4 text-small text-muted-foreground">
          Units, topics and course outcomes. Sage, practice and your reports use these names.
        </p>
        <TopicMapEditor
          courseId={courseId}
          initialMap={savedDraft}
          onCancel={hasMap ? () => setEditing(false) : undefined}
          onSaved={() => setEditing(false)}
        />
      </section>
    );
  }

  const topicCount = saved.units.reduce((n, u) => n + u.topics.length, 0);
  return (
    <section aria-labelledby="map-title" className="rounded-lg border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="map-title" className="text-title">
            Topic map
          </h2>
          <p className="text-small text-muted-foreground">
            {saved.units.length} {saved.units.length === 1 ? "unit" : "units"} · {topicCount} {topicCount === 1 ? "topic" : "topics"}
            {saved.outcomes.length ? ` · ${saved.outcomes.length} course outcomes` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </div>
      <ol className="grid gap-4">
        {saved.units.map((u, i) => (
          <li key={u.id} className="rounded-md border p-4">
            <h3 className="text-label">
              <span className="mr-2 font-mono text-small text-muted-foreground">Unit {i + 1}</span>
              {u.title}
            </h3>
            {u.topics.length ? (
              <ul className="mt-2 grid gap-2">
                {u.topics.map((t) => {
                  const notes = saved.notes[t.id] ?? [];
                  return (
                    <li key={t.id} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="min-w-0 text-body sm:flex-1">{t.title}</span>
                      {notes.length ? (
                        <span className="flex flex-wrap gap-1">
                          {notes.map((n) => (
                            <a
                              key={n.materialId}
                              href={`/api/materials/${n.materialId}/file?page=${n.pages[0] ?? 1}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border px-2.5 text-small text-muted-foreground transition-colors duration-150 ease-out hover:border-border-strong hover:text-foreground"
                              title={`${n.title}, ${n.pages.length === 1 ? "page" : "pages"} ${n.pages.join(", ")}`}
                            >
                              <FileText className="size-3.5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
                              <span className="truncate">{n.title}</span>
                              <span className="shrink-0 font-mono">p. {n.pages.join(", ")}</span>
                            </a>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-small text-muted-foreground">No topics yet.</p>
            )}
          </li>
        ))}
      </ol>
      {saved.outcomes.length ? (
        <div className="mt-6">
          <h3 className="mb-2 text-label">Course outcomes</h3>
          <dl className="grid gap-2">
            {saved.outcomes.map((o) => (
              <div key={o.id} className="grid grid-cols-[4rem_1fr] gap-3 text-body">
                <dt className="font-mono text-small text-muted-foreground">{o.code}</dt>
                <dd>{o.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
