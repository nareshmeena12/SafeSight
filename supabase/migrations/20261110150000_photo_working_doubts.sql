-- S21 (ROADMAP.md): photo of working and "Ask a human".
--
-- 1. sage_photos: a photo of handwritten working a student attached in Sage.
--    The image lives in the private Storage bucket `sage-photos` (no Storage
--    policies: only the server, with the service role, touches it). The
--    student reads their own rows; the course teacher reads a photo only once
--    it was sent in a chat they may read (flagged or shared). Images are
--    deleted after 30 days (nightly job); the row keeps `deleted_at`.
-- 2. course_tas: teaching assistants a teacher grants per course. A TA sees
--    only that course's doubts and an aggregate overview.
-- 3. doubts: "Still stuck? Ask your teacher" — the student's question, what
--    they tried and where they are stuck (drafted from the chat, edited by
--    the student). Course teacher and TAs read and answer them.
-- 4. course_announcements: an answer posted to the whole class when many
--    students ask the same thing. Enrolled students, teacher and TAs read.
-- 5. notifications: in-app notices (an answer arrived, you are now a TA).
--    The user reads their own and may mark them read.
--
-- Everything is written by the server with the service role after checking
-- the user under RLS, except notifications.read_at.

-- ---------------------------------------------------------------- 1. photos

create table public.sage_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  -- Set when the student confirms the transcription and sends it to Sage.
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  storage_path text check (char_length(storage_path) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 6291456),
  -- The vision model's reading: ["line 1", "line 2", …]; empty if it couldn't read it.
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  -- What the model said it couldn't read, for the student.
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'transcribed' check (status in ('transcribed', 'unreadable', 'failed', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- When the image was removed from Storage (30 days, or a day if never sent).
  deleted_at timestamptz
);
comment on table public.sage_photos is
  'Photos of handwritten working attached in Sage (image in the private sage-photos bucket, deleted after 30 days). Server-written.';
create index sage_photos_student_idx on public.sage_photos (student_id, created_at desc);
create index sage_photos_message_idx on public.sage_photos (message_id) where message_id is not null;
create index sage_photos_cleanup_idx on public.sage_photos (created_at) where deleted_at is null;

alter table public.sage_photos enable row level security;

create policy "sage_photos: student reads own"
  on public.sage_photos for select to authenticated
  using (student_id = (select auth.uid()));

create policy "sage_photos: teacher reads flagged or shared"
  on public.sage_photos for select to authenticated
  using (
    message_id is not null
    and conversation_id is not null
    and private.teacher_can_read_conversation(conversation_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sage-photos', 'sage-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- No storage.objects policies for this bucket: browsers never read or write
-- it directly. The server uploads, and hands out 60-second signed URLs after
-- checking sage_photos under RLS.

-- ---------------------------------------------------------------- 2. TAs

create table public.course_tas (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Snapshot for the teacher's list (TAs may not be enrolled, so profiles RLS wouldn't show them).
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text not null default '' check (char_length(email) <= 254),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
comment on table public.course_tas is
  'Teaching assistants per course: access to that course''s doubts and aggregate overview only. Server-written.';
create index course_tas_user_idx on public.course_tas (user_id);

alter table public.course_tas enable row level security;

-- True if the signed-in user is a teaching assistant for the course.
create function private.is_course_ta(p_course_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.course_tas t
    where t.course_id = p_course_id and t.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_course_ta(uuid) from public;
grant execute on function private.is_course_ta(uuid) to authenticated;

create policy "course_tas: course teacher reads"
  on public.course_tas for select to authenticated
  using (private.is_course_teacher(course_id));

create policy "course_tas: TA reads own"
  on public.course_tas for select to authenticated
  using (user_id = (select auth.uid()));

-- A TA may see the name and code of the courses they assist (not the join code: column-level reads aren't
-- possible under RLS, so the app reads course names for TAs with the service role instead).

-- ---------------------------------------------------------------- 3. doubts

create table public.doubts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- Snapshot: TAs can't read student profiles.
  student_name text not null default '' check (char_length(student_name) <= 200),
  conversation_id uuid references public.conversations (id) on delete set null,
  question text not null check (char_length(trim(question)) between 1 and 1000),
  tried text not null default '' check (char_length(tried) <= 1500),
  stuck_on text not null default '' check (char_length(stuck_on) <= 1000),
  -- The student also shared the chat with their teacher (conversations.shared_with_teacher).
  chat_shared boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'resolved')),
  answer text not null default '' check (char_length(answer) <= 4000),
  answered_by uuid references public.profiles (id) on delete set null,
  answered_by_name text not null default '' check (char_length(answered_by_name) <= 200),
  answered_at timestamptz,
  resolved_at timestamptz,
  announcement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.doubts is
  '"Ask your teacher" questions from Sage chats. Student reads own; course teacher and TAs read and answer. Server-written.';
create index doubts_course_idx on public.doubts (course_id, status, created_at desc);
create index doubts_student_idx on public.doubts (student_id, created_at desc);

alter table public.doubts enable row level security;

create policy "doubts: student reads own"
  on public.doubts for select to authenticated
  using (student_id = (select auth.uid()));

create policy "doubts: course teacher reads"
  on public.doubts for select to authenticated
  using (private.is_course_teacher(course_id));

create policy "doubts: course TA reads"
  on public.doubts for select to authenticated
  using (private.is_course_ta(course_id));

-- ---------------------------------------------------------------- 4. announcements

create table public.course_announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null check (char_length(trim(body)) between 1 and 6000),
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '' check (char_length(created_by_name) <= 200),
  -- How many doubts it answered.
  doubts integer not null default 0 check (doubts >= 0),
  created_at timestamptz not null default now()
);
comment on table public.course_announcements is
  'A class-wide answer to a doubt many students asked. Enrolled students, teacher and TAs read. Server-written.';
create index course_announcements_course_idx on public.course_announcements (course_id, created_at desc);

alter table public.doubts
  add constraint doubts_announcement_fk foreign key (announcement_id)
  references public.course_announcements (id) on delete set null;

alter table public.course_announcements enable row level security;

create policy "course_announcements: course members read"
  on public.course_announcements for select to authenticated
  using (
    private.is_course_teacher(course_id)
    or private.is_course_ta(course_id)
    or private.is_enrolled(course_id)
  );

-- ---------------------------------------------------------------- 5. notifications

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('doubt_answered', 'announcement', 'ta_added')),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 500),
  link text not null default '' check (char_length(link) <= 300 and (link = '' or link like '/%')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
comment on table public.notifications is 'In-app notices. The user reads their own and may set read_at. Server-written.';
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: user reads own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: user marks own read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------- 6. find a user by email (TA grant)

-- Only the server (service role) may look up accounts by email.
create function public.find_user_by_email(p_email text)
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.role
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;
revoke all on function public.find_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_by_email(text) to service_role;
