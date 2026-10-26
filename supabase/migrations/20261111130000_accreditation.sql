-- S24 (ROADMAP.md): accreditation reports (NAAC / NBA style).
--
-- 1. programs / program_outcomes: a degree programme (e.g. "B.Tech Mechanical
--    Engineering", run by a department) and its programme outcomes (PO1…PO12)
--    and programme-specific outcomes (PSO1…). Teachers of the institution read
--    them; the teacher who made the programme and the institution's admins
--    manage them.
-- 2. course_programs: which programme a course belongs to (one per course).
-- 3. co_po_mappings: the CO–PO mapping matrix of a course (levels 1–3).
-- 4. course_attainment_settings: thresholds and weights for the course's
--    CO attainment (target score, % of students per level, target level).
-- 5. course_assessments / assessment_questions / assessment_marks: what is
--    assessed and which COs it covers: an assignment (marks from approved
--    feedback or the number auto-check), or a test / exam whose question-wise
--    marks the teacher imports. Students read their own marks.
-- 6. course_topic_outcomes: topics ↔ COs, so practice and mock-test items
--    (students' own self-study, counted only as class aggregates) feed a CO.
--
-- Attainment itself is computed when read (lib/accreditation/attainment.ts),
-- never stored, so every number can be explained from the rows below.

-- course_outcomes (S22) gets a (id, course_id) key so mappings can't point at
-- another course's CO.
alter table public.course_outcomes
  add constraint course_outcomes_id_course_key unique (id, course_id);

-- ---------------------------------------------------------------- 1. programmes

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 200),
  department text not null default '' check (char_length(department) <= 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.programs is
  'A degree programme (run by a department) with its POs and PSOs. Read by the institution''s teachers.';
create index programs_institution_idx on public.programs (institution_id);
create index programs_created_by_idx on public.programs (created_by);

create table public.program_outcomes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  kind text not null check (kind in ('po', 'pso')),
  position smallint not null check (position between 0 and 49),
  code text not null check (char_length(code) between 1 and 16),
  title text not null default '' check (char_length(title) <= 120),
  description text not null check (char_length(description) between 1 and 800),
  created_at timestamptz not null default now(),
  unique (program_id, code)
);
comment on table public.program_outcomes is 'Programme outcomes (PO1…) and programme-specific outcomes (PSO1…).';
create index program_outcomes_program_idx on public.program_outcomes (program_id, kind, position);

alter table public.programs enable row level security;
alter table public.program_outcomes enable row level security;

-- True if the signed-in teacher may read the programme: they made it, or it
-- belongs to their institution.
create function private.can_read_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.programs pr
    join public.profiles me on me.id = (select auth.uid())
    where pr.id = p_program_id
      and me.role in ('teacher', 'admin')
      and (pr.created_by = me.id or (pr.institution_id is not null and pr.institution_id = me.institution_id))
  );
$$;

-- True if the signed-in user may change the programme and its outcomes: they
-- made it, or they are an admin of its institution.
create function private.can_manage_program(p_program_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.programs pr
    join public.profiles me on me.id = (select auth.uid())
    where pr.id = p_program_id
      and me.role in ('teacher', 'admin')
      and (
        pr.created_by = me.id
        or (me.role = 'admin' and pr.institution_id is not null and pr.institution_id = me.institution_id)
      )
  );
$$;

revoke all on function private.can_read_program(uuid) from public;
revoke all on function private.can_manage_program(uuid) from public;
grant execute on function private.can_read_program(uuid) to authenticated;
grant execute on function private.can_manage_program(uuid) to authenticated;

-- Checks the row's own columns (not can_read_program), so a new row can be returned by its insert.
create policy "programs: institution teachers read"
  on public.programs for select to authenticated
  using (
    created_by = (select auth.uid())
    or (
      institution_id is not null
      and institution_id = (select private.my_institution_id())
      and (select private.is_teacher())
    )
  );

create policy "programs: teachers create in their institution"
  on public.programs for insert to authenticated
  with check (
    (select private.is_teacher())
    and created_by = (select auth.uid())
    and (institution_id is null or institution_id = (select private.my_institution_id()))
  );

create policy "programs: owner or admin updates"
  on public.programs for update to authenticated
  using ((select private.can_manage_program(id)))
  with check (institution_id is null or institution_id = (select private.my_institution_id()));

create policy "programs: owner or admin deletes"
  on public.programs for delete to authenticated
  using ((select private.can_manage_program(id)));

create policy "program_outcomes: programme readers read"
  on public.program_outcomes for select to authenticated
  using ((select private.can_read_program(program_id)));

create policy "program_outcomes: programme managers manage"
  on public.program_outcomes for all to authenticated
  using ((select private.can_manage_program(program_id)))
  with check ((select private.can_manage_program(program_id)));

-- ---------------------------------------------------------------- 2. course ↔ programme

create table public.course_programs (
  course_id uuid primary key references public.courses (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  linked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.course_programs is 'The programme a course belongs to (for its CO–PO mapping).';
create index course_programs_program_idx on public.course_programs (program_id);

alter table public.course_programs enable row level security;

create policy "course_programs: course teacher or programme readers read"
  on public.course_programs for select to authenticated
  using ((select private.is_course_teacher(course_id)) or (select private.can_read_program(program_id)));

create policy "course_programs: course teacher links to a programme they can read"
  on public.course_programs for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)) and (select private.can_read_program(program_id)));

-- True if the programme outcome belongs to the programme the course is linked to.
create function private.course_program_has_outcome(p_course_id uuid, p_program_outcome_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.course_programs cp
    join public.program_outcomes po on po.program_id = cp.program_id
    where cp.course_id = p_course_id and po.id = p_program_outcome_id
  );
$$;
revoke all on function private.course_program_has_outcome(uuid, uuid) from public;
grant execute on function private.course_program_has_outcome(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- 3. CO–PO matrix

create table public.co_po_mappings (
  course_id uuid not null,
  outcome_id uuid not null,
  program_outcome_id uuid not null references public.program_outcomes (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  justification text not null default '' check (char_length(justification) <= 400),
  updated_at timestamptz not null default now(),
  primary key (outcome_id, program_outcome_id),
  foreign key (outcome_id, course_id) references public.course_outcomes (id, course_id) on delete cascade
);
comment on table public.co_po_mappings is
  'CO–PO mapping matrix: how strongly a course outcome supports a programme outcome (1 low, 2 medium, 3 high).';
create index co_po_mappings_course_idx on public.co_po_mappings (course_id);

alter table public.co_po_mappings enable row level security;

create policy "co_po_mappings: course teacher reads"
  on public.co_po_mappings for select to authenticated
  using ((select private.is_course_teacher(course_id)));

create policy "co_po_mappings: course teacher manages"
  on public.co_po_mappings for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check (
    (select private.is_course_teacher(course_id))
    and (select private.course_program_has_outcome(course_id, program_outcome_id))
  );

-- ---------------------------------------------------------------- 4. settings

create table public.course_attainment_settings (
  course_id uuid primary key references public.courses (id) on delete cascade,
  -- A student attains a CO in an assessment when they score at least this % of its marks.
  target_pct real not null default 60 check (target_pct > 0 and target_pct <= 100),
  -- % of students who must attain it for level 1, 2 and 3.
  level1_pct real not null default 50 check (level1_pct > 0 and level1_pct <= 100),
  level2_pct real not null default 60 check (level2_pct > 0 and level2_pct <= 100),
  level3_pct real not null default 70 check (level3_pct > 0 and level3_pct <= 100),
  -- The level the course aims for (shown as met / not met).
  target_level real not null default 2 check (target_level between 1 and 3),
  -- Weights of students' own practice and mock tests (0 = shown but not counted).
  practice_weight real not null default 0.5 check (practice_weight between 0 and 10),
  mock_weight real not null default 0.5 check (mock_weight between 0 and 10),
  academic_year text not null default '' check (char_length(academic_year) <= 40),
  updated_at timestamptz not null default now(),
  check (level1_pct <= level2_pct and level2_pct <= level3_pct)
);
comment on table public.course_attainment_settings is 'Thresholds and weights for a course''s CO attainment.';

alter table public.course_attainment_settings enable row level security;

create policy "course_attainment_settings: course teacher manages"
  on public.course_attainment_settings for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

-- ---------------------------------------------------------------- 5. assessments

create table public.course_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- assignment: an assignment in SafeSight. test: a test or exam whose marks are imported.
  kind text not null check (kind in ('assignment', 'test')),
  assignment_id uuid unique references public.assignments (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  weight real not null default 1 check (weight between 0 and 10),
  held_on date,
  -- Assignments: the COs the whole assignment assesses. Tests map COs per question.
  outcome_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, course_id),
  check ((kind = 'assignment') = (assignment_id is not null))
);
comment on table public.course_assessments is
  'What is assessed for CO attainment: an assignment, or a test / exam with imported marks.';
create index course_assessments_course_idx on public.course_assessments (course_id);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  course_id uuid not null,
  position smallint not null check (position between 0 and 99),
  label text not null check (char_length(label) between 1 and 16),
  max_marks real not null check (max_marks > 0 and max_marks <= 1000),
  outcome_ids uuid[] not null default '{}',
  unique (assessment_id, position),
  foreign key (assessment_id, course_id) references public.course_assessments (id, course_id) on delete cascade
);
comment on table public.assessment_questions is 'Questions of a test with their maximum marks and the COs each assesses.';

create table public.assessment_marks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  course_id uuid not null,
  -- The roll number (upper case) or email (lower case) the row was imported with.
  row_key text not null check (char_length(row_key) between 1 and 254),
  roll_number text check (roll_number is null or char_length(roll_number) <= 32),
  email text check (email is null or char_length(email) <= 254),
  student_name text not null default '' check (char_length(student_name) <= 120),
  -- The enrolled student it matched, if any.
  student_id uuid references public.profiles (id) on delete set null,
  -- Marks per question: {question id: marks}; a missing or null entry = not attempted.
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'),
  absent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (assessment_id, row_key),
  foreign key (assessment_id, course_id) references public.course_assessments (id, course_id) on delete cascade
);
comment on table public.assessment_marks is
  'Question-wise marks of a test, imported by the teacher. The student reads their own row.';
create index assessment_marks_student_idx on public.assessment_marks (student_id);

alter table public.course_assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_marks enable row level security;

create policy "course_assessments: course teacher manages"
  on public.course_assessments for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check (
    (select private.is_course_teacher(course_id))
    and (assignment_id is null or private.course_of_assignment(assignment_id) = course_id)
  );

-- Students see the tests of their courses (titles, marks out of, COs) next to their own marks.
create policy "course_assessments: enrolled students read tests"
  on public.course_assessments for select to authenticated
  using (kind = 'test' and (select private.is_enrolled(course_id)));

create policy "assessment_questions: course teacher manages"
  on public.assessment_questions for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

create policy "assessment_questions: enrolled students read"
  on public.assessment_questions for select to authenticated
  using ((select private.is_enrolled(course_id)));

create policy "assessment_marks: course teacher manages"
  on public.assessment_marks for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

create policy "assessment_marks: student reads own"
  on public.assessment_marks for select to authenticated
  using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------- 6. topics ↔ COs

create table public.course_topic_outcomes (
  topic_id uuid not null,
  outcome_id uuid not null,
  course_id uuid not null,
  primary key (topic_id, outcome_id),
  foreign key (topic_id, course_id) references public.course_topics (id, course_id) on delete cascade,
  foreign key (outcome_id, course_id) references public.course_outcomes (id, course_id) on delete cascade
);
comment on table public.course_topic_outcomes is
  'Which course outcomes a topic serves; practice and mock-test items on the topic count towards them.';
create index course_topic_outcomes_course_idx on public.course_topic_outcomes (course_id);

alter table public.course_topic_outcomes enable row level security;

create policy "course_topic_outcomes: course teacher manages"
  on public.course_topic_outcomes for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
