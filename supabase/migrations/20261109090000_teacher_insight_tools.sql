-- S19 (ROADMAP.md): teacher insight tools.
--
-- 1. assignments.rubric: an optional rubric (one criterion per line) that
--    "Draft feedback" follows. Students may read it, like the instructions.
-- 2. lecture_briefs: "Before your next class" per course per week: the top
--    misconceptions with anonymised quotes, the share of the class affected,
--    a suggested 5-minute explanation and a 5-question quiz. Teacher-only.
-- 3. brief_quiz_sessions / brief_quiz_responses: the brief's quiz run live in
--    class with a 6-digit code. Students answer on their phones; the teacher
--    sees counts per option only (answers are anonymous to the teacher).
-- 4. feedback_drafts: per-criterion feedback on a submitted piece of work.
--    The teacher edits and approves it; the student reads it only once it is
--    approved.
-- 5. teacher_digests / teacher_digest_prefs: the Monday digest (what was in
--    it and whether it was emailed) and the teacher's email choice.
--
-- Everything except the digest preference is written by the server with the
-- service role after it has checked the user under RLS.

-- ---------------------------------------------------------------- 1. rubric

alter table public.assignments
  add column rubric text not null default '' check (char_length(rubric) <= 6000);
comment on column public.assignments.rubric is
  'Optional marking rubric, one criterion per line ("Criterion (10): what it looks for"). Used by Draft feedback.';

-- ---------------------------------------------------------------- 2. briefs

create table public.lecture_briefs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Monday (India time) of the week the brief was made in. One brief per course per week.
  week date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  source text not null check (source in ('schedule', 'teacher')),
  -- [{title, summary, studentRefs, students, quotes[], explanation}]
  misconceptions jsonb not null check (jsonb_typeof(misconceptions) = 'array'),
  -- [{question, options[4], answer, explanation, misconception}]
  quiz jsonb not null check (jsonb_typeof(quiz) = 'array'),
  -- {messages, students, enrolled}
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, week)
);
comment on table public.lecture_briefs is
  'Pre-lecture brief per course per week (misconceptions, anonymised quotes, quiz). Teacher-only; server-written.';

alter table public.lecture_briefs enable row level security;

create policy "lecture_briefs: course teacher reads"
  on public.lecture_briefs for select to authenticated
  using (private.is_course_teacher(course_id));

-- ---------------------------------------------------------------- 3. live quiz

create table public.brief_quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.lecture_briefs (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  -- A copy of the brief's quiz when the session started (regenerating the brief doesn't change a running quiz).
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours',
  closed_at timestamptz
);
comment on table public.brief_quiz_sessions is
  'A live in-class run of a brief''s quiz. Teacher reads; students reach it by code through the server.';
create index brief_quiz_sessions_code_idx on public.brief_quiz_sessions (code, created_at desc);
create index brief_quiz_sessions_brief_idx on public.brief_quiz_sessions (brief_id);

alter table public.brief_quiz_sessions enable row level security;

create policy "brief_quiz_sessions: course teacher reads"
  on public.brief_quiz_sessions for select to authenticated
  using (private.is_course_teacher(course_id));
-- Students have no policy: the questions carry the answers. The server shows
-- them the questions after checking they are enrolled.

create table public.brief_quiz_responses (
  session_id uuid not null references public.brief_quiz_sessions (id) on delete cascade,
  question_index smallint not null check (question_index between 0 and 9),
  student_id uuid not null references public.profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, question_index, student_id)
);
comment on table public.brief_quiz_responses is
  'One student''s answer to one live-quiz question. The student reads their own; teachers see counts only (server).';
create index brief_quiz_responses_student_idx on public.brief_quiz_responses (student_id);

alter table public.brief_quiz_responses enable row level security;

create policy "brief_quiz_responses: student reads own"
  on public.brief_quiz_responses for select to authenticated
  using (student_id = (select auth.uid()));
-- No teacher policy (the results page shows counts per option, computed on
-- the server) and no write policies (the server writes).

-- ---------------------------------------------------------------- 4. feedback

create table public.feedback_drafts (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  -- [{criterion, description, maxPoints, points, comment}]
  criteria jsonb not null check (jsonb_typeof(criteria) = 'array'),
  overall text not null default '' check (char_length(overall) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.feedback_drafts is
  'Feedback per rubric criterion on a submission. Drafts are teacher-only; the student reads it once approved.';

alter table public.feedback_drafts enable row level security;

create policy "feedback_drafts: course teacher reads"
  on public.feedback_drafts for select to authenticated
  using (private.teaches_submission(submission_id));

create policy "feedback_drafts: student reads approved"
  on public.feedback_drafts for select to authenticated
  using (status = 'approved' and private.owns_submission(submission_id));
-- No write policies: the server writes after checking the teacher under RLS.

-- ---------------------------------------------------------------- 5. digest

create table public.teacher_digests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  week date not null,
  content jsonb not null,
  email_status text not null check (email_status in ('sent', 'not_configured', 'opted_out', 'failed')),
  emailed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (teacher_id, week)
);
comment on table public.teacher_digests is
  'The Monday digest a teacher got (or would have got): content snapshot and email outcome. Server-written.';

alter table public.teacher_digests enable row level security;

create policy "teacher_digests: teacher reads own"
  on public.teacher_digests for select to authenticated
  using (teacher_id = (select auth.uid()));

create table public.teacher_digest_prefs (
  teacher_id uuid primary key references public.profiles (id) on delete cascade,
  weekly_email boolean not null default true,
  updated_at timestamptz not null default now()
);
comment on table public.teacher_digest_prefs is
  'Whether a teacher wants the Monday digest by email (default yes). The teacher manages their own row.';

alter table public.teacher_digest_prefs enable row level security;

create policy "teacher_digest_prefs: teacher reads own"
  on public.teacher_digest_prefs for select to authenticated
  using (teacher_id = (select auth.uid()));

create policy "teacher_digest_prefs: teacher inserts own"
  on public.teacher_digest_prefs for insert to authenticated
  with check (teacher_id = (select auth.uid()) and private.is_teacher());

create policy "teacher_digest_prefs: teacher updates own"
  on public.teacher_digest_prefs for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
