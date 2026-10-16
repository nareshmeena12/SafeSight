-- S3: the core schema (PLAN.md §8) with row-level security on every table.
--
-- Access model
--   * Students read and write their own rows only.
--   * Teachers read their own courses and the students enrolled in them.
--     Message text is visible to a teacher only when the conversation has a
--     flag in their course or the student shared it (PLAN.md §9).
--   * Labels, flags, reports and metrics are written by the server with the
--     service role (it bypasses RLS); no browser role may write them.
--   * Admin analytics is v2: admins get no extra read access yet.
--
-- Helper functions live in the `private` schema (not exposed by the Data API)
-- and are SECURITY DEFINER so policies can check membership without
-- recursing into each other's RLS.

create extension if not exists vector with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- types

create type public.ai_mode as enum ('learn', 'assist', 'exam');
create type public.message_role as enum ('user', 'assistant');
create type public.message_intent as enum (
  'concept_question', 'answer_seeking', 'pasted_question', 'off_topic', 'distress'
);
create type public.writing_event_type as enum ('type', 'paste', 'delete', 'focus', 'blur');
create type public.flag_type as enum (
  'answer_seeking',        -- repeated answer-seeking
  'exam_mode_attempt',     -- used Sage on an Exam-mode assignment
  'instruction_override',  -- "ignore your instructions" and similar
  'wellbeing'              -- signs of distress; private, high priority
);
create type public.flag_severity as enum ('low', 'medium', 'high');
create type public.flag_status as enum ('open', 'resolved');
create type public.pilot_role as enum ('teacher', 'hod', 'admin', 'student', 'other');

-- ---------------------------------------------------------------- tables

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 200),
  city text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.institutions is 'A college or coaching institute.';

alter table public.profiles
  add constraint profiles_institution_id_fkey
  foreign key (institution_id) references public.institutions (id) on delete set null;
create index profiles_institution_id_idx on public.profiles (institution_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions (id) on delete set null,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 200),
  code text not null default '' check (length(code) <= 32),
  join_code text not null unique
    default upper(substr(md5(gen_random_uuid()::text), 1, 6))
    check (join_code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);
comment on table public.courses is 'A course a teacher runs. Students join with join_code.';
create index courses_teacher_id_idx on public.courses (teacher_id);
create index courses_institution_id_idx on public.courses (institution_id);

create table public.enrollments (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);
comment on table public.enrollments is 'Which students are in which course.';
create index enrollments_student_id_idx on public.enrollments (student_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  instructions text not null default '',
  ai_mode public.ai_mode not null default 'learn',
  -- Guidance for Sage. Enrolled students can read it: never put answer keys here.
  teacher_notes text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.assignments is 'An assignment and its AI rule (Learn, Assist, Exam).';
create index assignments_course_id_idx on public.assignments (course_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  file_path text not null,
  created_at timestamptz not null default now()
);
comment on table public.materials is 'Uploaded notes and PDFs (file in Supabase Storage).';
create index materials_course_id_idx on public.materials (course_id);

create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  content text not null,
  page integer check (page > 0),
  -- 1024 dimensions fits BAAI/bge-m3 (multilingual, on DeepInfra). Changing the
  -- embedding model to another size needs a migration and a re-embed.
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);
comment on table public.material_chunks is 'Searchable pieces of course material (pgvector).';
create index material_chunks_material_id_idx on public.material_chunks (material_id);
create index material_chunks_embedding_idx on public.material_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  -- The student chose to share this chat with their teacher.
  shared_with_teacher boolean not null default false,
  started_at timestamptz not null default now()
);
comment on table public.conversations is 'One Sage chat thread.';
create index conversations_student_id_idx on public.conversations (student_id);
create index conversations_assignment_id_idx on public.conversations (assignment_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  intent public.message_intent,
  hint_level smallint check (hint_level between 1 and 5),
  created_at timestamptz not null default now()
);
comment on table public.messages is 'Every Sage message, with its label and hint-ladder step.';
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  -- null while the student is still writing.
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
comment on table public.submissions is 'Work written in the Trace editor.';
create index submissions_student_id_idx on public.submissions (student_id);

create table public.writing_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  type public.writing_event_type not null,
  -- Characters added or removed (0 for focus/blur).
  size integer not null default 0 check (size >= 0),
  at timestamptz not null default now()
);
comment on table public.writing_events is 'Recorded editing events, sent in batches.';
create index writing_events_submission_id_at_idx on public.writing_events (submission_id, at);

create table public.integrity_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  paste_ratio real not null check (paste_ratio between 0 and 1),
  active_minutes real not null check (active_minutes >= 0),
  sessions integer not null check (sessions >= 0),
  summary text not null,
  created_at timestamptz not null default now()
);
comment on table public.integrity_reports is 'Trace''s neutral evidence summary for a submission.';

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  type public.flag_type not null,
  severity public.flag_severity not null default 'medium',
  message_id uuid references public.messages (id) on delete set null,
  reason text not null default '',
  status public.flag_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
comment on table public.flags is 'Things the teacher should look at.';
create index flags_course_id_status_idx on public.flags (course_id, status);
create index flags_student_id_idx on public.flags (student_id);
create index flags_message_id_idx on public.flags (message_id);

create table public.weekly_metrics (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Monday of the ISO week.
  week date not null check (extract(isodow from week) = 1),
  messages integer not null default 0 check (messages >= 0),
  answer_seeking_share real not null default 0 check (answer_seeking_share between 0 and 1),
  reliance_score real not null default 0 check (reliance_score between 0 and 100),
  primary key (student_id, course_id, week)
);
comment on table public.weekly_metrics is 'Pre-computed weekly numbers for the dashboard.';
create index weekly_metrics_course_id_week_idx on public.weekly_metrics (course_id, week);

create table public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  institution text not null check (length(trim(institution)) between 1 and 200),
  role public.pilot_role not null,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  message text not null default '' check (length(message) <= 2000),
  created_at timestamptz not null default now()
);
comment on table public.pilot_requests is 'Landing-page pilot form. Written by the API route (service role) only.';

-- ---------------------------------------------------------------- helpers

-- True if the signed-in user teaches the course.
create function private.is_course_teacher(p_course_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.teacher_id = (select auth.uid())
  );
$$;

-- True if the signed-in user is enrolled in the course.
create function private.is_enrolled(p_course_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.student_id = (select auth.uid())
  );
$$;

-- True if the signed-in user teaches a course the student is enrolled in.
create function private.teaches_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student_id and c.teacher_id = (select auth.uid())
  );
$$;

-- True if the signed-in user teaches a course the user is enrolled in, from
-- the student's side: lets students see their teachers' names.
create function private.is_my_teacher(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = (select auth.uid()) and c.teacher_id = p_teacher_id
  );
$$;

create function private.course_of_assignment(p_assignment_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select course_id from public.assignments where id = p_assignment_id;
$$;

-- True if the signed-in user owns the conversation.
create function private.owns_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.student_id = (select auth.uid())
  );
$$;

-- True if the signed-in teacher may read the conversation's messages: the
-- student shared it, or one of its messages carries a flag in a course the
-- teacher runs.
create function private.teacher_can_read_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    join public.courses co on co.id = a.course_id
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

-- Submission helpers.
create function private.owns_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    where s.id = p_submission_id and s.student_id = (select auth.uid())
  );
$$;

create function private.teaches_submission(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.courses c on c.id = a.course_id
    where s.id = p_submission_id and c.teacher_id = (select auth.uid())
  );
$$;

create function private.is_teacher()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('teacher', 'admin')
  );
$$;

create function private.my_institution_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select institution_id from public.profiles where id = (select auth.uid());
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.institutions enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.submissions enable row level security;
alter table public.writing_events enable row level security;
alter table public.integrity_reports enable row level security;
alter table public.flags enable row level security;
alter table public.weekly_metrics enable row level security;
alter table public.pilot_requests enable row level security;

-- institutions: members read their own institution.
create policy "institutions: read own"
  on public.institutions for select to authenticated
  using (id = (select private.my_institution_id()));

-- profiles: besides "read own" (S1), teachers read their students and
-- students read their teachers.
create policy "profiles: teachers read their students"
  on public.profiles for select to authenticated
  using ((select private.teaches_student(id)));
create policy "profiles: students read their teachers"
  on public.profiles for select to authenticated
  using ((select private.is_my_teacher(id)));

-- courses
create policy "courses: teacher reads own"
  on public.courses for select to authenticated
  using (teacher_id = (select auth.uid()));
create policy "courses: students read enrolled"
  on public.courses for select to authenticated
  using ((select private.is_enrolled(id)));
create policy "courses: teacher creates own"
  on public.courses for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select private.is_teacher()));
create policy "courses: teacher updates own"
  on public.courses for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
create policy "courses: teacher deletes own"
  on public.courses for delete to authenticated
  using (teacher_id = (select auth.uid()));

-- enrollments: students join through public.join_course(); teachers manage
-- their own rosters.
create policy "enrollments: student reads own"
  on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()));
create policy "enrollments: teacher reads course"
  on public.enrollments for select to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "enrollments: teacher adds to course"
  on public.enrollments for insert to authenticated
  with check ((select private.is_course_teacher(course_id)));
create policy "enrollments: teacher removes from course"
  on public.enrollments for delete to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "enrollments: student leaves"
  on public.enrollments for delete to authenticated
  using (student_id = (select auth.uid()));

-- assignments
create policy "assignments: teacher manages"
  on public.assignments for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
create policy "assignments: students read enrolled"
  on public.assignments for select to authenticated
  using ((select private.is_enrolled(course_id)));

-- materials
create policy "materials: teacher manages"
  on public.materials for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
create policy "materials: students read enrolled"
  on public.materials for select to authenticated
  using ((select private.is_enrolled(course_id)));

-- material_chunks: written by the server (embedding pipeline) only.
create policy "material_chunks: course members read"
  on public.material_chunks for select to authenticated
  using (exists (
    select 1 from public.materials m
    where m.id = material_id
      and ((select private.is_course_teacher(m.course_id)) or (select private.is_enrolled(m.course_id)))
  ));

-- conversations
create policy "conversations: student reads own"
  on public.conversations for select to authenticated
  using (student_id = (select auth.uid()));
create policy "conversations: student starts own"
  on public.conversations for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (assignment_id is null
         or (select private.is_enrolled(private.course_of_assignment(assignment_id))))
  );
create policy "conversations: student shares own"
  on public.conversations for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy "conversations: teacher reads course"
  on public.conversations for select to authenticated
  using ((select private.is_course_teacher(private.course_of_assignment(assignment_id))));
-- Students may only flip shared_with_teacher; the rest is fixed.
revoke update on public.conversations from authenticated, anon;
grant update (shared_with_teacher) on public.conversations to authenticated;

-- messages: students read and add their own; labels (intent, hint_level) and
-- assistant replies are written by the server.
create policy "messages: student reads own"
  on public.messages for select to authenticated
  using ((select private.owns_conversation(conversation_id)));
create policy "messages: student writes own"
  on public.messages for insert to authenticated
  with check (
    (select private.owns_conversation(conversation_id))
    and role = 'user' and intent is null and hint_level is null
  );
create policy "messages: teacher reads flagged or shared"
  on public.messages for select to authenticated
  using ((select private.teacher_can_read_conversation(conversation_id)));

-- submissions
create policy "submissions: student reads own"
  on public.submissions for select to authenticated
  using (student_id = (select auth.uid()));
create policy "submissions: student starts own"
  on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select private.is_enrolled(private.course_of_assignment(assignment_id)))
  );
create policy "submissions: student edits draft"
  on public.submissions for update to authenticated
  using (student_id = (select auth.uid()) and submitted_at is null)
  with check (student_id = (select auth.uid()));
create policy "submissions: teacher reads course"
  on public.submissions for select to authenticated
  using ((select private.is_course_teacher(private.course_of_assignment(assignment_id))));
revoke update on public.submissions from authenticated, anon;
grant update (content, submitted_at, updated_at) on public.submissions to authenticated;

-- writing_events
create policy "writing_events: student reads own"
  on public.writing_events for select to authenticated
  using ((select private.owns_submission(submission_id)));
create policy "writing_events: student records own draft"
  on public.writing_events for insert to authenticated
  with check (exists (
    select 1 from public.submissions s
    where s.id = submission_id and s.student_id = (select auth.uid()) and s.submitted_at is null
  ));
create policy "writing_events: teacher reads course"
  on public.writing_events for select to authenticated
  using ((select private.teaches_submission(submission_id)));

-- integrity_reports: server writes; student and teacher read.
create policy "integrity_reports: student reads own"
  on public.integrity_reports for select to authenticated
  using ((select private.owns_submission(submission_id)));
create policy "integrity_reports: teacher reads course"
  on public.integrity_reports for select to authenticated
  using ((select private.teaches_submission(submission_id)));

-- flags: server writes. Teachers read and resolve flags in their courses.
-- Students see their own flags except private wellbeing flags.
create policy "flags: teacher reads course"
  on public.flags for select to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "flags: teacher resolves"
  on public.flags for update to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
create policy "flags: student reads own"
  on public.flags for select to authenticated
  using (student_id = (select auth.uid()) and type <> 'wellbeing');
revoke update on public.flags from authenticated, anon;
grant update (status, resolved_at) on public.flags to authenticated;

-- weekly_metrics: server writes.
create policy "weekly_metrics: student reads own"
  on public.weekly_metrics for select to authenticated
  using (student_id = (select auth.uid()));
create policy "weekly_metrics: teacher reads course"
  on public.weekly_metrics for select to authenticated
  using ((select private.is_course_teacher(course_id)));

-- pilot_requests: no policies. Only the service role (the API route) reads or
-- writes.

-- ---------------------------------------------------------------- RPC

-- Students join a course with its 6-character code. Returns the course id, or
-- null if the code matches no course.
create function public.join_course(p_join_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_course_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'student'
  ) then
    raise exception 'only students can join a course';
  end if;

  select id into v_course_id from public.courses
  where join_code = upper(trim(p_join_code));
  if v_course_id is null then
    return null;
  end if;

  insert into public.enrollments (course_id, student_id)
  values (v_course_id, (select auth.uid()))
  on conflict do nothing;
  return v_course_id;
end;
$$;

revoke all on function public.join_course(text) from public, anon;
grant execute on function public.join_course(text) to authenticated;
