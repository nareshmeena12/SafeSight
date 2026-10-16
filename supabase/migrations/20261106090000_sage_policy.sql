-- Sage safety and speed (policy engine, output guard, Explore chat).
--
-- 1. New classify_message intents. Existing rows keep their labels;
--    "concept" is still stored as concept_question, pasted_question is legacy.
-- 2. Teacher controls per assignment: max hint level and worked examples on
--    assignments (students may see them), and a private answer key next to
--    the teacher notes (teacher-only, row-level security).
-- 3. Hint-ladder state per student per assignment (not per conversation), so
--    a new chat doesn't reset the ladder. Written by the server only.
-- 4. Explore chats: conversations get a course_id (backfilled from the
--    assignment, required for new chats) and assignment_id stays optional.
-- 5. Messages: idempotency key, reply link, attempt quality, the matched
--    assignment, latency and the guard outcome.
--
-- Functions that use the new enum values live in the next migration: a new
-- enum value can't be used in the transaction that adds it.

-- ---------------------------------------------------------------- 1. intents

alter type public.message_intent add value if not exists 'verify_answer';
alter type public.message_intent add value if not exists 'attempt';
alter type public.message_intent add value if not exists 'deliverable_request';
alter type public.message_intent add value if not exists 'jailbreak';

-- ---------------------------------------------------------------- 2. teacher controls

alter table public.assignments
  -- Highest hint-ladder step Sage may unlock (1 Clarify … 4 Parallel example).
  -- Checking a student's own working (step 5) is always allowed.
  add column max_hint_level smallint not null default 4 check (max_hint_level between 1 and 4),
  -- Whether Sage may work a parallel example (step 4).
  add column worked_examples boolean not null default true;

alter table public.assignment_teacher_notes
  -- The teacher's private answer key. Sage's output guard compares every
  -- draft against it; it is never shown to students.
  add column answer_key text not null default '' check (length(answer_key) <= 8000);

comment on column public.assignment_teacher_notes.answer_key is
  'Private answer key. Teacher-only; read by the server (service role) for the output guard.';

-- ---------------------------------------------------------------- 3. ladder state

create table public.sage_ladder_state (
  student_id uuid not null references public.profiles (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  -- Highest step unlocked so far (1 Clarify … 4 Parallel example).
  step smallint not null default 1 check (step between 1 and 4),
  -- Genuine attempts (attempt_quality >= 0.5) that climbed the ladder.
  attempts integer not null default 0 check (attempts >= 0),
  -- Last time Sage worked a parallel example (at most one per hour).
  last_example_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, assignment_id)
);
comment on table public.sage_ladder_state is
  'Sage hint-ladder step per student per assignment. Server-written; survives new chats.';
create index sage_ladder_state_assignment_id_idx on public.sage_ladder_state (assignment_id);

alter table public.sage_ladder_state enable row level security;

create policy "sage_ladder_state: student reads own"
  on public.sage_ladder_state for select to authenticated
  using (student_id = (select auth.uid()));
create policy "sage_ladder_state: teacher reads course"
  on public.sage_ladder_state for select to authenticated
  using ((select private.is_course_teacher(private.course_of_assignment(assignment_id))));
-- No insert/update/delete policies: only the service role writes.

-- ---------------------------------------------------------------- 4. explore chats

alter table public.conversations
  add column course_id uuid references public.courses (id) on delete cascade;

update public.conversations c
set course_id = a.course_id
from public.assignments a
where a.id = c.assignment_id and c.course_id is null;


-- Assignment chats take the assignment's course when none is given.
create function private.conversation_course()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assignment_id is not null then
    new.course_id := (select a.course_id from public.assignments a where a.id = new.assignment_id);
  end if;
  return new;
end;
$$;

create trigger conversations_course
  before insert on public.conversations
  for each row execute function private.conversation_course();

-- Every new chat has a course. Older chats whose assignment was deleted have
-- none and are left as they are (students can still read them).
alter table public.conversations
  add constraint conversations_course_required check (course_id is not null) not valid;
create index conversations_course_id_idx on public.conversations (course_id);

comment on column public.conversations.course_id is
  'Course of the chat. Assignment chats copy it from the assignment; Explore chats ("Ask Sage") have no assignment.';

drop policy "conversations: student starts own" on public.conversations;
create policy "conversations: student starts own"
  on public.conversations for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select private.is_enrolled(course_id))
  );

drop policy "conversations: teacher reads course" on public.conversations;
create policy "conversations: teacher reads course"
  on public.conversations for select to authenticated
  using ((select private.is_course_teacher(course_id)));

create or replace function private.teacher_can_read_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    join public.courses co on co.id = c.course_id
    where c.id = p_conversation_id
      and c.shared_with_teacher
      and co.teacher_id = (select auth.uid())
  ) or exists (
    select 1 from public.flags f
    join public.messages m on m.id = f.message_id
    join public.courses co on co.id = f.course_id
    where m.conversation_id = p_conversation_id
      and co.teacher_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------- 5. messages

alter table public.messages
  -- The browser's message id: a retry or double-send of the same message is
  -- answered once.
  add column client_id text check (length(client_id) <= 100),
  -- Sage's reply points at the student message it answers.
  add column reply_to uuid references public.messages (id) on delete set null,
  -- classify_message: 0 (no attempt) … 1 (full worked attempt).
  add column attempt_quality real check (attempt_quality between 0 and 1),
  -- The active assignment this message matches best, and how closely (0–1).
  add column matched_assignment_id uuid references public.assignments (id) on delete set null,
  add column match_score real check (match_score between 0 and 1),
  -- Sage's reply: milliseconds to the first token and to the end.
  add column ttft_ms integer check (ttft_ms >= 0),
  add column latency_ms integer check (latency_ms >= 0),
  -- Output guard outcome: pass, regenerated, safe_hint, fixed (no model call).
  add column guard text check (guard in ('pass', 'regenerated', 'safe_hint', 'fixed'));

create unique index messages_client_id_key on public.messages (client_id) where client_id is not null;
create index messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;

-- Students still may only add plain user messages; every label is server-written.
drop policy "messages: student writes own" on public.messages;
create policy "messages: student writes own"
  on public.messages for insert to authenticated
  with check (
    (select private.owns_conversation(conversation_id))
    and role = 'user' and intent is null and hint_level is null
    and topic is null and attempted is null and citations = '[]'::jsonb
    and reply_to is null and attempt_quality is null and matched_assignment_id is null
    and match_score is null and ttft_ms is null and latency_ms is null and guard is null
  );
