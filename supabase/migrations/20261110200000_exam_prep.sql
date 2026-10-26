-- Exam prep (S20): a day-by-day revision plan per student per course, built
-- from the course's topics and notes and weighted by the student's weak
-- topics and mistake log, plus timed mock tests from the course notes.
--
-- 1. course_exam_info: what the teacher may publish to improve the plans —
--    official syllabus topics, the exam pattern and the exam date. The course
--    teacher manages it; enrolled students read it (it is not secret).
-- 2. course_note_topics: topics read out of the course notes once per set of
--    notes (a cache shared by the course's students). Server only.
-- 3. exam_plans: one plan per student per course (re-planning replaces it).
--    Student reads own; the server writes, including ticks.
-- 4. mock_tests / mock_test_items / mock_test_item_keys: timed mock tests.
--    Practice only — never linked to graded assignments, never shown to the
--    teacher. Solutions stay in the server-only keys table until submitted.
--
-- Mock results feed topic_mastery, so its last_source gains 'mock'.

-- ---------------------------------------------------------------- 1. exam info

create table public.course_exam_info (
  course_id uuid primary key references public.courses (id) on delete cascade,
  -- [{title, unit}] — the official syllabus topics, in teaching order.
  topics jsonb not null default '[]'::jsonb check (jsonb_typeof(topics) = 'array' and jsonb_array_length(topics) <= 40),
  -- Free text, e.g. "3 hours. Part A: 10 × 2-mark short answers. Part B: 5 of 7 numericals, 10 marks each."
  pattern text not null default '' check (char_length(pattern) <= 2000),
  exam_date date,
  updated_at timestamptz not null default now()
);
comment on table public.course_exam_info is
  'Official syllabus topics, exam pattern and exam date a teacher publishes for exam prep. Teacher manages; enrolled students read.';

alter table public.course_exam_info enable row level security;

create policy "course_exam_info: teacher reads"
  on public.course_exam_info for select to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "course_exam_info: student reads enrolled"
  on public.course_exam_info for select to authenticated
  using ((select private.is_enrolled(course_id)));
create policy "course_exam_info: teacher inserts"
  on public.course_exam_info for insert to authenticated
  with check ((select private.is_course_teacher(course_id)));
create policy "course_exam_info: teacher updates"
  on public.course_exam_info for update to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
create policy "course_exam_info: teacher deletes"
  on public.course_exam_info for delete to authenticated
  using ((select private.is_course_teacher(course_id)));

-- ---------------------------------------------------------------- 2. topics from notes

create table public.course_note_topics (
  course_id uuid primary key references public.courses (id) on delete cascade,
  -- [{title, materialId, page}]
  topics jsonb not null check (jsonb_typeof(topics) = 'array'),
  -- Which notes they were read from (ready material ids and chunk counts); a change re-reads them.
  source_key text not null check (char_length(source_key) <= 4000),
  created_at timestamptz not null default now()
);
comment on table public.course_note_topics is
  'Topics read from a course''s notes for exam plans, cached per set of notes. Server only (RLS on, no policies).';

alter table public.course_note_topics enable row level security;
-- No policies: server only.

-- ---------------------------------------------------------------- 3. plans

create table public.exam_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_date date not null,
  minutes_per_day smallint not null check (minutes_per_day between 15 and 240),
  -- [{key, title, unit, source, weight, mastery, mistakes, reasons[], notes[]}] — why each topic is in the plan.
  topics jsonb not null check (jsonb_typeof(topics) = 'array'),
  -- [{date, kind, tasks: [{id, kind, topic, key, minutes, title}]}]
  days jsonb not null check (jsonb_typeof(days) = 'array'),
  -- Ticked task ids and topic keys the student marked as revised.
  done text[] not null default '{}',
  checked text[] not null default '{}',
  -- What the plan was built from: {syllabus, notes, pattern}.
  sources jsonb not null default '{}'::jsonb check (jsonb_typeof(sources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id)
);
comment on table public.exam_plans is
  'A student''s revision plan for one course''s exam. Student reads own; server writes.';
create index exam_plans_student_idx on public.exam_plans (student_id, exam_date);

alter table public.exam_plans enable row level security;

create policy "exam_plans: student reads own"
  on public.exam_plans for select to authenticated
  using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------- 4. mock tests

create table public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  plan_id uuid references public.exam_plans (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  -- The topics it covers (labels).
  topics jsonb not null default '[]'::jsonb check (jsonb_typeof(topics) = 'array'),
  minutes smallint not null check (minutes between 5 and 180),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  submitted_at timestamptz,
  graded_at timestamptz,
  -- Marks earned / marks of the checked questions, once graded.
  marks real check (marks >= 0),
  max_marks real check (max_marks >= 0),
  score real check (score between 0 and 1)
);
comment on table public.mock_tests is
  'Timed mock tests from the course notes. Practice only: never graded work, never shown to the teacher. Student reads own; server writes.';
create index mock_tests_student_idx on public.mock_tests (student_id, started_at desc);
create index mock_tests_plan_idx on public.mock_tests (plan_id);

create table public.mock_test_items (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.mock_tests (id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  kind text not null check (kind in ('conceptual', 'numeric')),
  -- choice: multiple choice. open: a written answer.
  format text not null check (format in ('choice', 'open')),
  topic text not null default '' check (char_length(topic) <= 120),
  question text not null check (char_length(question) between 1 and 3000),
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  marks smallint not null default 1 check (marks between 1 and 20),
  -- Saved while the test runs.
  answer text check (char_length(answer) <= 4000),
  choice smallint,
  saved_at timestamptz,
  -- Filled in when the test is graded; the solution is copied from the key only then.
  score real check (score between 0 and 1),
  verdict text check (verdict in ('correct', 'partly', 'not_yet', 'unchecked')),
  feedback text check (char_length(feedback) <= 2000),
  solution text check (char_length(solution) <= 4000),
  unique (test_id, position)
);
comment on table public.mock_test_items is
  'Questions of a mock test, the student''s answers and, after grading, feedback and the worked solution.';

create table public.mock_test_item_keys (
  item_id uuid primary key references public.mock_test_items (id) on delete cascade,
  solution text not null check (char_length(solution) <= 4000),
  final_answer text not null default '' check (char_length(final_answer) <= 500),
  correct_choice smallint
);
comment on table public.mock_test_item_keys is
  'Answers and worked solutions of mock test items before grading. Server only (RLS on, no policies).';

alter table public.mock_tests enable row level security;
alter table public.mock_test_items enable row level security;
alter table public.mock_test_item_keys enable row level security;

create function private.owns_mock_test(p_test_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mock_tests t
    where t.id = p_test_id and t.student_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_mock_test(uuid) from public;
grant execute on function private.owns_mock_test(uuid) to authenticated;

create policy "mock_tests: student reads own"
  on public.mock_tests for select to authenticated
  using (student_id = (select auth.uid()));

create policy "mock_test_items: student reads own"
  on public.mock_test_items for select to authenticated
  using ((select private.owns_mock_test(test_id)));

-- mock_test_item_keys: no policies (server only).

-- ---------------------------------------------------------------- mastery from mock tests

alter table public.topic_mastery drop constraint if exists topic_mastery_last_source_check;
alter table public.topic_mastery
  add constraint topic_mastery_last_source_check
  check (last_source in ('practice', 'review', 'refresher', 'explain_back', 'mock'));
