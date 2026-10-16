-- S13–S15: Live Lab Mode (PLAN.md §4 "Live Lab Mode").
--
-- A teacher runs a lab session for one of their courses. Students on lab PCs
-- join it from the SafeSight Lab Chrome extension with the 6-digit code and
-- their roll number. The extension is not signed in to Supabase: it talks to
-- the Next.js API (/api/lab/*), which checks a per-seat token and writes with
-- the service role. So the browser roles only ever *read* lab data:
--   * the course teacher reads sessions, seats, events and reports, and
--     creates / ends / deletes sessions;
--   * a student reads the seats, events and reports linked to their account.
-- Teachers watch the grid live through Supabase Realtime (lab_seats and
-- lab_events are in the supabase_realtime publication; Realtime applies RLS).

-- ---------------------------------------------------------------- types

create type public.lab_event_type as enum (
  'joined',         -- the extension started recording on this seat
  'rejoined',       -- the same roll number joined again (browser restarted)
  'left',           -- the student finished early from the extension
  'stopped',        -- the extension stopped because the session ended
  'tab_switch',     -- another tab became active (detail.host)
  'left_browser',   -- Chrome lost focus to another app
  'returned',       -- Chrome got focus back (detail.seconds away)
  'copy',           -- detail.chars (never the text)
  'paste',          -- detail.chars (never the text)
  'blocked_site',   -- tried to open a blocked site (detail.host)
  'idle',           -- no input for a while
  'active',         -- input again after idle (detail.seconds idle)
  'heartbeat_gap'   -- server: a heartbeat came after > 30 s of silence (detail.seconds)
);

-- ---------------------------------------------------------------- roll numbers

-- Lab seats are matched to student accounts by roll number (within the
-- session's course). Students set their own through set_my_roll_number().
alter table public.profiles
  add column if not exists roll_number text
  check (roll_number is null or roll_number ~ '^[A-Z0-9/-]{1,32}$');
create index if not exists profiles_roll_number_idx on public.profiles (roll_number);

-- ---------------------------------------------------------------- tables

create table public.lab_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  room text not null default '' check (length(room) <= 80),
  -- 6 digits, typed on the lab PC. Unique so a code always means one session.
  code text not null unique check (code ~ '^[0-9]{6}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Set when the teacher ends the session early.
  ended_at timestamptz,
  -- Extra domains on top of SafeSight's AI list (lowercase host names).
  blocklist text[] not null default '{}' check (cardinality(blocklist) <= 100),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours')
);
comment on table public.lab_sessions is 'A Live Lab Mode exam session for one course (PLAN.md §4).';
create index lab_sessions_course_id_idx on public.lab_sessions (course_id, starts_at desc);

create table public.lab_seats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lab_sessions (id) on delete cascade,
  -- The enrolled student with this roll number, when there is exactly one.
  student_id uuid references public.profiles (id) on delete set null,
  roll_number text not null check (roll_number ~ '^[A-Z0-9/-]{1,32}$'),
  -- The PC's label set by the lab admin in the extension (falls back to the roll number).
  seat_label text not null check (length(trim(seat_label)) between 1 and 32),
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  -- Set when the extension stopped cleanly (student finished, or session ended).
  stopped_at timestamptz,
  unique (session_id, roll_number)
);
comment on table public.lab_seats is 'One student''s seat in a lab session, with its last heartbeat.';
create index lab_seats_student_id_idx on public.lab_seats (student_id);

-- The seat's secret token (sha256). Its own table with no policies, so no
-- browser role (nor Realtime) ever sees it.
create table public.lab_seat_tokens (
  seat_id uuid primary key references public.lab_seats (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.lab_seat_tokens is 'Hashed extension tokens for lab seats. Service role only.';

create table public.lab_events (
  id bigint generated always as identity primary key,
  -- Repeated from the seat so Realtime can filter by session.
  session_id uuid not null references public.lab_sessions (id) on delete cascade,
  seat_id uuid not null references public.lab_seats (id) on delete cascade,
  type public.lab_event_type not null,
  -- Small facts only: host, chars, seconds. Never page text or clipboard text.
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 1024),
  at timestamptz not null default now()
);
comment on table public.lab_events is 'What the lab extension recorded, per seat.';
create index lab_events_session_id_at_idx on public.lab_events (session_id, at);
create index lab_events_seat_id_at_idx on public.lab_events (seat_id, at);

create table public.lab_reports (
  seat_id uuid primary key references public.lab_seats (id) on delete cascade,
  session_id uuid not null references public.lab_sessions (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete set null,
  -- Counts behind the summary (see src/lib/lab/report.ts).
  metrics jsonb not null,
  summary text not null,
  created_at timestamptz not null default now()
);
comment on table public.lab_reports is 'Per-seat evidence summary after a lab session, in Trace''s neutral style.';
create index lab_reports_session_id_idx on public.lab_reports (session_id);
create index lab_reports_student_id_idx on public.lab_reports (student_id);

-- ---------------------------------------------------------------- helpers

-- True if the signed-in user teaches the session's course.
create function private.teaches_lab_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lab_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = p_session_id and c.teacher_id = (select auth.uid())
  );
$$;

-- True if the signed-in user has a seat in the session.
create function private.has_lab_seat(p_session_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lab_seats st
    where st.session_id = p_session_id and st.student_id = (select auth.uid())
  );
$$;

-- True if the seat belongs to the signed-in student.
create function private.owns_lab_seat(p_seat_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lab_seats st
    where st.id = p_seat_id and st.student_id = (select auth.uid())
  );
$$;

revoke all on function private.teaches_lab_session(uuid) from public;
revoke all on function private.has_lab_seat(uuid) from public;
revoke all on function private.owns_lab_seat(uuid) from public;
grant execute on function private.teaches_lab_session(uuid) to authenticated;
grant execute on function private.has_lab_seat(uuid) to authenticated;
grant execute on function private.owns_lab_seat(uuid) to authenticated;

-- A student sets (or clears) their own roll number. Normalised to upper case
-- without spaces, the same way the lab API normalises what is typed on a PC.
create function public.set_my_roll_number(p_roll_number text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v text := nullif(upper(regexp_replace(coalesce(p_roll_number, ''), '\s', '', 'g')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if v is not null and v !~ '^[A-Z0-9/-]{1,32}$' then
    raise exception 'invalid roll number' using errcode = '22023';
  end if;
  update public.profiles set roll_number = v where id = (select auth.uid());
  return v;
end;
$$;
revoke all on function public.set_my_roll_number(text) from public, anon;
grant execute on function public.set_my_roll_number(text) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.lab_sessions enable row level security;
alter table public.lab_seats enable row level security;
alter table public.lab_seat_tokens enable row level security;
alter table public.lab_events enable row level security;
alter table public.lab_reports enable row level security;

-- Sessions: the course teacher manages them; a student with a seat reads it.
create policy "lab_sessions: teacher reads course"
  on public.lab_sessions for select to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "lab_sessions: teacher creates for own course"
  on public.lab_sessions for insert to authenticated
  with check ((select private.is_course_teacher(course_id)) and created_by = (select auth.uid()));
create policy "lab_sessions: teacher updates course"
  on public.lab_sessions for update to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
create policy "lab_sessions: teacher deletes course"
  on public.lab_sessions for delete to authenticated
  using ((select private.is_course_teacher(course_id)));
create policy "lab_sessions: student reads own"
  on public.lab_sessions for select to authenticated
  using ((select private.has_lab_seat(id)));

-- Teachers may only end a session or change its end time and blocklist.
revoke update on public.lab_sessions from authenticated, anon;
grant update (ended_at, ends_at, blocklist, title, room) on public.lab_sessions to authenticated;

-- Seats, events, reports: read-only for browser roles.
create policy "lab_seats: teacher reads course"
  on public.lab_seats for select to authenticated
  using ((select private.teaches_lab_session(session_id)));
create policy "lab_seats: student reads own"
  on public.lab_seats for select to authenticated
  using (student_id = (select auth.uid()));

create policy "lab_events: teacher reads course"
  on public.lab_events for select to authenticated
  using ((select private.teaches_lab_session(session_id)));
create policy "lab_events: student reads own"
  on public.lab_events for select to authenticated
  using ((select private.owns_lab_seat(seat_id)));

create policy "lab_reports: teacher reads course"
  on public.lab_reports for select to authenticated
  using ((select private.teaches_lab_session(session_id)));
create policy "lab_reports: student reads own"
  on public.lab_reports for select to authenticated
  using (student_id = (select auth.uid()));

revoke insert, update, delete on public.lab_seats, public.lab_events, public.lab_reports
  from authenticated, anon;
revoke all on public.lab_seat_tokens from authenticated, anon;

-- ---------------------------------------------------------------- realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lab_seats, public.lab_events;
  end if;
end;
$$;
