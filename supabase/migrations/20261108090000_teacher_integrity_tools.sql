-- S18 (ROADMAP.md): teacher integrity tools.
--
-- 1. assignment_number_sets: per-student numbers for a numeric problem. The
--    variables (with ranges) and the answer formula are teacher-only: the
--    formula gives the method away. Each student's values are worked out on
--    the server from the student and assignment ids, so nothing per student
--    is stored here.
-- 2. numeric_answers: the final answer a student gives for such a problem.
--    The student reads their own; the course teacher reads the class. Written
--    by the server (service role) after it checks the work isn't submitted.
-- 3. viva_questions: questions Lens suggests for a short conversation about a
--    submitted piece of work, and which ones the teacher has discussed.
--    Teacher-only (they are the teacher's preparation, like teacher notes).
--
-- The AI resilience check stores nothing: its result goes back to the form.

-- ---------------------------------------------------------------- 1. number sets

create table public.assignment_number_sets (
  assignment_id uuid primary key references public.assignments (id) on delete cascade,
  -- [{name, label, unit, min, max, decimals}], validated by the app (zod).
  variables jsonb not null check (jsonb_typeof(variables) = 'array' and jsonb_array_length(variables) between 1 and 8),
  formula text not null check (char_length(formula) between 1 and 500),
  answer_label text not null default '' check (char_length(answer_label) <= 60),
  answer_unit text not null default '' check (char_length(answer_unit) <= 20),
  tolerance_pct numeric(6, 3) not null default 1 check (tolerance_pct > 0 and tolerance_pct <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.assignment_number_sets is
  'Per-student numbers for a numeric assignment: variables with ranges and the answer formula. Teacher-only.';

alter table public.assignment_number_sets enable row level security;

create policy "assignment_number_sets: course teacher manages"
  on public.assignment_number_sets for all to authenticated
  using (private.is_course_teacher(private.course_of_assignment(assignment_id)))
  with check (private.is_course_teacher(private.course_of_assignment(assignment_id)));
-- Students have no policy: Sage and their pages read it with the service role.

-- ---------------------------------------------------------------- 2. answers

create table public.numeric_answers (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  answer_text text not null check (char_length(answer_text) between 1 and 100),
  -- The number read from answer_text; null when none could be read.
  answer_value double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
comment on table public.numeric_answers is
  'A student''s final answer to a per-student-numbers assignment. Server-written; the check is computed when read.';
create index numeric_answers_student_idx on public.numeric_answers (student_id);

alter table public.numeric_answers enable row level security;

create policy "numeric_answers: student reads own"
  on public.numeric_answers for select to authenticated
  using (student_id = (select auth.uid()));

create policy "numeric_answers: course teacher reads"
  on public.numeric_answers for select to authenticated
  using (private.is_course_teacher(private.course_of_assignment(assignment_id)));
-- No insert/update/delete policies: only the service role writes.

-- ---------------------------------------------------------------- 3. viva questions

create table public.viva_questions (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  -- [{question, lookFor, discussedAt}]
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.viva_questions is
  'Questions Lens suggested for talking a submission through with its writer. Teacher-only; server-written.';

alter table public.viva_questions enable row level security;

create policy "viva_questions: course teacher reads"
  on public.viva_questions for select to authenticated
  using (private.teaches_submission(submission_id));
-- No write policies: the server writes after checking the teacher under RLS.
