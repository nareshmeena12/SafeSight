-- S9 Trace: content snapshots for the teacher replay.
--
-- writing_events records what happened (type, paste, delete, focus) and how
-- many characters. To replay *how the text looked* over time, the editor also
-- saves the document every batch (every ~5s) when it changed since the last one.

create table public.writing_snapshots (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  -- Editor HTML (Tiptap). Rendered only through a read-only Tiptap editor,
  -- whose schema drops anything that is not a known node or mark.
  content text not null check (char_length(content) <= 400000),
  -- Plain-text length of the document at this moment.
  char_count integer not null default 0 check (char_count >= 0),
  at timestamptz not null default now()
);
comment on table public.writing_snapshots is 'Trace editor document snapshots, saved with each event batch, for the replay.';
create index writing_snapshots_submission_id_at_idx on public.writing_snapshots (submission_id, at);

alter table public.writing_snapshots enable row level security;

-- Same rules as writing_events: the student records while the draft is open;
-- the student and the course teacher read.
create policy "writing_snapshots: student reads own"
  on public.writing_snapshots for select to authenticated
  using ((select private.owns_submission(submission_id)));
create policy "writing_snapshots: student records own draft"
  on public.writing_snapshots for insert to authenticated
  with check (exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.student_id = (select auth.uid()) and s.submitted_at is null
  ));
create policy "writing_snapshots: teacher reads course"
  on public.writing_snapshots for select to authenticated
  using ((select private.teaches_submission(submission_id)));

revoke update, delete on public.writing_snapshots from authenticated, anon;
