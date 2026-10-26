-- S23 (ROADMAP.md): institution dashboard and the college AI policy.
--
-- 1. departments: an institution's departments. profiles.department_id (a
--    teacher's department) and courses.department_id (new courses take their
--    teacher's). Only the institution's admin changes either (RPCs below).
-- 2. ai_policies: the AI policy per department, plus one college default
--    (department_id null). New assignments start from it; a trigger makes sure
--    teachers can only be stricter (allowed modes, highest hint step, worked
--    examples) unless the admin lets them loosen it. Lab Mode is a yes/no per
--    department.
-- 3. teacher_invites: admins invite teachers by email into a department. An
--    invite is claimed when that (confirmed) email signs up or logs in
--    (claim_teacher_invites). S25 (in parallel) adds staff_invites without
--    departments; fold the two together once both are merged.
-- 4. Admin reads: their institution's departments, policies, invites, courses
--    and staff profiles under RLS. Everything about students comes from
--    SECURITY DEFINER functions that return aggregates only (counts, averages
--    over at least 3 students), never names, chats or scores of one student.
--
-- Admins are still made by hand (service role). An admin without an
-- institution sees nothing.

-- ---------------------------------------------------------------- helpers

create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.institution_id is not null
  );
$$;

-- S25 (sign-in, run in parallel) defines the same helper with the same
-- meaning; `or replace` lets the two migrations apply in either order.
create or replace function private.is_institution_admin(p_institution uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.institution_id = p_institution
  );
$$;

-- ---------------------------------------------------------------- 1. departments

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  -- Short code, e.g. ME, CSE.
  code text not null default '' check (char_length(code) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, institution_id)
);
comment on table public.departments is 'A department of an institution. The institution admin manages them.';
create unique index departments_name_idx on public.departments (institution_id, lower(name));

alter table public.profiles
  add column department_id uuid references public.departments (id) on delete set null;
create index profiles_department_id_idx on public.profiles (department_id);
comment on column public.profiles.department_id is 'A teacher''s department (set by the institution admin).';

alter table public.courses
  add column department_id uuid references public.departments (id) on delete set null;
create index courses_department_id_idx on public.courses (department_id);
comment on column public.courses.department_id is 'The department whose AI policy applies. Defaults to the teacher''s.';

alter table public.departments enable row level security;

create policy "departments: institution members read"
  on public.departments for select to authenticated
  using (institution_id = (select private.my_institution_id()));
create policy "departments: admin creates"
  on public.departments for insert to authenticated
  with check ((select private.is_institution_admin(institution_id)));
create policy "departments: admin updates"
  on public.departments for update to authenticated
  using ((select private.is_institution_admin(institution_id)))
  with check ((select private.is_institution_admin(institution_id)));
create policy "departments: admin deletes"
  on public.departments for delete to authenticated
  using ((select private.is_institution_admin(institution_id)));
revoke update on public.departments from authenticated, anon;
grant update (name, code, updated_at) on public.departments to authenticated;

-- New courses: the teacher's institution and department, unless given.
create function private.course_defaults()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid;
  v_dept uuid;
begin
  select p.institution_id, p.department_id into v_inst, v_dept
  from public.profiles p where p.id = new.teacher_id;
  if new.institution_id is null then
    new.institution_id := v_inst;
  end if;
  if new.department_id is null and v_dept is not null and new.institution_id is not distinct from v_inst then
    new.department_id := v_dept;
  end if;
  return new;
end;
$$;

create trigger courses_defaults
  before insert on public.courses
  for each row execute function private.course_defaults();

-- Teachers may only rename their courses and change the join code. The
-- institution and department are the admin's (admin_set_course_department).
revoke update on public.courses from authenticated, anon;
grant update (name, code, join_code) on public.courses to authenticated;

-- Courses made before S23 carry no institution; take the teacher's.
update public.courses c
set institution_id = p.institution_id
from public.profiles p
where c.teacher_id = p.id and c.institution_id is null and p.institution_id is not null;

-- ---------------------------------------------------------------- 2. ai_policies

create table public.ai_policies (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  -- null = the college default, used by courses without a department policy.
  department_id uuid,
  allowed_modes public.ai_mode[] not null default '{learn,assist,exam}'
    check (cardinality(allowed_modes) between 1 and 3),
  -- What a new assignment starts with.
  default_mode public.ai_mode not null default 'learn',
  max_hint_level smallint not null default 4 check (max_hint_level between 1 and 4),
  worked_examples boolean not null default true,
  lab_mode_allowed boolean not null default true,
  -- true: the policy is only a starting point; teachers may set anything.
  teachers_can_loosen boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_mode = any (allowed_modes)),
  foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete cascade
);
comment on table public.ai_policies is
  'The AI policy per department (department_id null = college default). Teachers can only be stricter unless teachers_can_loosen.';
create unique index ai_policies_scope_idx on public.ai_policies
  (institution_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.ai_policies enable row level security;

create policy "ai_policies: institution staff read"
  on public.ai_policies for select to authenticated
  using (institution_id = (select private.my_institution_id()) and (select private.is_teacher()));
create policy "ai_policies: admin creates"
  on public.ai_policies for insert to authenticated
  with check ((select private.is_institution_admin(institution_id)));
create policy "ai_policies: admin updates"
  on public.ai_policies for update to authenticated
  using ((select private.is_institution_admin(institution_id)))
  with check ((select private.is_institution_admin(institution_id)));
create policy "ai_policies: admin deletes"
  on public.ai_policies for delete to authenticated
  using ((select private.is_institution_admin(institution_id)));
revoke update on public.ai_policies from authenticated, anon;
grant update (allowed_modes, default_mode, max_hint_level, worked_examples, lab_mode_allowed,
  teachers_can_loosen, updated_by, updated_at) on public.ai_policies to authenticated;

-- The policy that applies to a course: its department's, else the college
-- default, else none (no row = no limits, as before S23).
create function private.course_policy(p_course_id uuid)
returns setof public.ai_policies language sql stable security definer set search_path = ''
as $$
  select ap.*
  from public.courses c
  join public.ai_policies ap on ap.institution_id = c.institution_id
    and (ap.department_id = c.department_id or ap.department_id is null)
  where c.id = p_course_id
  order by ap.department_id is null
  limit 1;
$$;

-- For the teacher's assignment form and lab dialog: the course's policy, if
-- the caller teaches the course or is its institution's admin.
create function public.course_ai_policy(p_course_id uuid)
returns table (
  scope text, department_name text, allowed_modes public.ai_mode[], default_mode public.ai_mode,
  max_hint_level smallint, worked_examples boolean, lab_mode_allowed boolean, teachers_can_loosen boolean
)
language sql stable security definer set search_path = ''
as $$
  select case when p.department_id is null then 'college' else 'department' end,
         coalesce(d.name, ''), p.allowed_modes, p.default_mode, p.max_hint_level,
         p.worked_examples, p.lab_mode_allowed, p.teachers_can_loosen
  from private.course_policy(p_course_id) p
  left join public.departments d on d.id = p.department_id
  where (select private.is_course_teacher(p_course_id))
     or (select private.is_institution_admin(p.institution_id));
$$;
revoke all on function public.course_ai_policy(uuid) from public, anon;
grant execute on function public.course_ai_policy(uuid) to authenticated;

-- Teachers can only be stricter: checked on every assignment a signed-in user
-- writes. Settings that didn't change are left alone, so an assignment made
-- before a policy tightened can still be edited. Exam mode turns Sage off, so
-- its hint settings don't matter. The service role (seed, demo scripts) is
-- not checked.
create function private.enforce_assignment_policy()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p public.ai_policies;
  v_mode boolean := true;
  v_hint boolean := true;
  v_examples boolean := true;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  select * into p from private.course_policy(new.course_id);
  if not found or p.teachers_can_loosen then
    return new;
  end if;
  -- On update, only check what changed (a mode change re-checks the rest).
  if tg_op = 'UPDATE' then
    v_mode := new.ai_mode is distinct from old.ai_mode;
    v_hint := v_mode or new.max_hint_level is distinct from old.max_hint_level;
    v_examples := v_mode or new.worked_examples is distinct from old.worked_examples;
  end if;
  if v_mode and not (new.ai_mode = any (p.allowed_modes)) then
    raise exception 'ai_policy: mode % is not allowed', new.ai_mode using errcode = 'P0001', hint = 'ai_policy_mode';
  end if;
  if new.ai_mode <> 'exam' then
    if v_hint and new.max_hint_level > p.max_hint_level then
      raise exception 'ai_policy: hint step % is above %', new.max_hint_level, p.max_hint_level
        using errcode = 'P0001', hint = 'ai_policy_hint';
    end if;
    if v_examples and new.worked_examples and not p.worked_examples then
      raise exception 'ai_policy: worked examples are off' using errcode = 'P0001', hint = 'ai_policy_examples';
    end if;
  end if;
  return new;
end;
$$;

create trigger assignments_ai_policy
  before insert or update of ai_mode, max_hint_level, worked_examples on public.assignments
  for each row execute function private.enforce_assignment_policy();

-- Lab Mode allowed: a yes/no for the department (teachers_can_loosen doesn't apply).
create function private.enforce_lab_policy()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p public.ai_policies;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  select * into p from private.course_policy(new.course_id);
  if found and not p.lab_mode_allowed then
    raise exception 'ai_policy: Lab Mode is off' using errcode = 'P0001', hint = 'ai_policy_lab';
  end if;
  return new;
end;
$$;

create trigger lab_sessions_ai_policy
  before insert on public.lab_sessions
  for each row execute function private.enforce_lab_policy();

-- ---------------------------------------------------------------- 3. teacher_invites

create table public.teacher_invites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  department_id uuid,
  email text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+$' and char_length(email) <= 254),
  full_name text not null default '' check (char_length(full_name) <= 120),
  -- pending: no account yet; joined: the teacher is in the institution.
  status text not null default 'pending' check (status in ('pending', 'joined')),
  teacher_id uuid references public.profiles (id) on delete set null,
  invited_by uuid references public.profiles (id) on delete set null,
  -- queued | sent | failed | not_configured
  email_status text not null default 'not_configured'
    check (email_status in ('queued', 'sent', 'failed', 'not_configured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  joined_at timestamptz,
  foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null (department_id)
);
comment on table public.teacher_invites is
  'Teachers an admin invited by email. Claimed at sign-up or log-in with that confirmed email. Server-written.';
create unique index teacher_invites_email_idx on public.teacher_invites (institution_id, email);
create index teacher_invites_email_lookup_idx on public.teacher_invites (email) where status = 'pending';

alter table public.teacher_invites enable row level security;

create policy "teacher_invites: admin reads"
  on public.teacher_invites for select to authenticated
  using ((select private.is_institution_admin(institution_id)));
create policy "teacher_invites: admin removes"
  on public.teacher_invites for delete to authenticated
  using ((select private.is_institution_admin(institution_id)));
-- Inserts and updates: the server with the service role, after the admin check.

-- Claims pending invites for the signed-in user's confirmed email: makes them
-- a teacher of that institution (and department). Never moves someone out of
-- another institution, never touches an admin, and never turns a student who
-- is already in a course into a teacher. Returns the user's role afterwards.
create function public.claim_teacher_invites()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_profile public.profiles;
  r public.teacher_invites;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return null;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null or v_profile.role = 'admin' then
    return v_profile.role::text;
  end if;
  if v_profile.role = 'student' and exists (select 1 from public.enrollments e where e.student_id = v_uid) then
    return v_profile.role::text;
  end if;

  select * into r from public.teacher_invites
  where email = v_email and status = 'pending'
    and (v_profile.institution_id is null or institution_id = v_profile.institution_id)
  order by created_at desc
  limit 1;
  if not found then
    return v_profile.role::text;
  end if;

  update public.profiles
  set role = 'teacher', institution_id = r.institution_id,
      department_id = coalesce(r.department_id, department_id)
  where id = v_uid;
  update public.courses set institution_id = r.institution_id
  where teacher_id = v_uid and institution_id is null;
  update public.teacher_invites
  set status = 'joined', teacher_id = v_uid, joined_at = now(), updated_at = now()
  where institution_id = r.institution_id and email = v_email and status = 'pending';
  return 'teacher';
end;
$$;
revoke all on function public.claim_teacher_invites() from public, anon;
grant execute on function public.claim_teacher_invites() to authenticated;

-- ---------------------------------------------------------------- 4. admin reads

create policy "profiles: admin reads institution staff"
  on public.profiles for select to authenticated
  using (role in ('teacher', 'admin') and (select private.is_institution_admin(institution_id)));

create policy "courses: admin reads institution"
  on public.courses for select to authenticated
  using ((select private.is_institution_admin(institution_id)));

-- Moves a teacher into a department (null = none). Their courses that had no
-- department follow them.
create function public.admin_set_teacher_department(p_teacher_id uuid, p_department_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := (select private.my_institution_id());
begin
  if not (select private.is_admin()) then
    return false;
  end if;
  if not exists (
    select 1 from public.profiles where id = p_teacher_id and institution_id = v_inst and role in ('teacher', 'admin')
  ) then
    return false;
  end if;
  if p_department_id is not null
     and not exists (select 1 from public.departments where id = p_department_id and institution_id = v_inst) then
    return false;
  end if;
  update public.profiles set department_id = p_department_id where id = p_teacher_id;
  if p_department_id is not null then
    update public.courses set department_id = p_department_id
    where teacher_id = p_teacher_id and institution_id = v_inst and department_id is null;
  end if;
  return true;
end;
$$;

create function public.admin_set_course_department(p_course_id uuid, p_department_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := (select private.my_institution_id());
begin
  if not (select private.is_admin()) then
    return false;
  end if;
  if p_department_id is not null
     and not exists (select 1 from public.departments where id = p_department_id and institution_id = v_inst) then
    return false;
  end if;
  update public.courses set department_id = p_department_id
  where id = p_course_id and institution_id = v_inst;
  return found;
end;
$$;

-- Staff list with emails (admins need them to tell people apart).
create function public.admin_staff()
returns table (
  id uuid, full_name text, email text, role public.user_role, department_id uuid,
  courses integer, last_active_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, lower(u.email)::text, p.role, p.department_id,
         (select count(*)::int from public.courses c where c.teacher_id = p.id),
         (select max(a.created_at) from public.ai_usage a where a.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where (select private.is_admin())
    and p.institution_id = (select private.my_institution_id())
    and p.role in ('teacher', 'admin')
  order by p.full_name;
$$;

-- Weekly adoption for the whole institution: distinct students and teachers
-- with any activity that week (India-time weeks, Monday first), and how many
-- students are enrolled in its courses now.
--   students: a message to Sage, Trace writing, practice, a mock test, an
--             explain-back, or any AI call of their own in the institution;
--   teachers: an AI call (Lens, briefs, previews…), a new assignment, a flag
--             resolved, a doubt answered or a lab session.
create function public.admin_adoption(p_weeks integer default 8)
returns table (
  week date, active_students integer, active_teachers integer, sage_messages integer, enrolled_students integer
)
language sql stable security definer set search_path = ''
as $$
  with inst as (
    select (select private.my_institution_id()) as id
    where (select private.is_admin())
  ),
  weeks as (
    select (date_trunc('week', (now() at time zone 'Asia/Kolkata')) - make_interval(weeks => g))::date as week
    from generate_series(0, least(greatest(p_weeks, 1), 26) - 1) g
  ),
  since as (select min(week)::timestamp at time zone 'Asia/Kolkata' as t from weeks),
  courses as (select c.id, c.teacher_id from public.courses c, inst where c.institution_id = inst.id),
  student_events as (
    select cv.student_id as uid, m.created_at as at, 1 as msg
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    join courses c on c.id = cv.course_id
    where m.role = 'user' and m.created_at >= (select t from since)
    union all
    select s.student_id, s.updated_at, 0
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join courses c on c.id = a.course_id
    where s.updated_at >= (select t from since)
    union all
    select ps.student_id, ps.created_at, 0 from public.practice_sets ps join courses c on c.id = ps.course_id
    where ps.created_at >= (select t from since)
    union all
    select mt.student_id, mt.started_at, 0 from public.mock_tests mt join courses c on c.id = mt.course_id
    where mt.started_at >= (select t from since)
    union all
    select eb.student_id, eb.created_at, 0 from public.explain_backs eb join courses c on c.id = eb.course_id
    where eb.created_at >= (select t from since)
    union all
    select au.user_id, au.created_at, 0
    from public.ai_usage au
    join public.profiles p on p.id = au.user_id and p.role = 'student'
    where au.institution_id = (select id from inst) and au.created_at >= (select t from since)
  ),
  teacher_events as (
    select au.user_id as uid, au.created_at as at
    from public.ai_usage au
    join public.profiles p on p.id = au.user_id and p.role in ('teacher', 'admin')
    where au.institution_id = (select id from inst) and au.created_at >= (select t from since)
    union all
    select c.teacher_id, a.created_at from public.assignments a join courses c on c.id = a.course_id
    where a.created_at >= (select t from since)
    union all
    select c.teacher_id, f.resolved_at from public.flags f join courses c on c.id = f.course_id
    where f.resolved_at >= (select t from since)
    union all
    select d.answered_by, d.answered_at from public.doubts d join courses c on c.id = d.course_id
    where d.answered_at >= (select t from since) and d.answered_by is not null
    union all
    select ls.created_by, ls.created_at from public.lab_sessions ls join courses c on c.id = ls.course_id
    where ls.created_at >= (select t from since)
  ),
  s as (
    select date_trunc('week', at at time zone 'Asia/Kolkata')::date as week,
           count(distinct uid)::int as n, sum(msg)::int as msgs
    from student_events group by 1
  ),
  t as (
    select date_trunc('week', at at time zone 'Asia/Kolkata')::date as week, count(distinct uid)::int as n
    from teacher_events group by 1
  )
  select w.week, coalesce(s.n, 0), coalesce(t.n, 0), coalesce(s.msgs, 0),
         (select count(distinct e.student_id)::int from public.enrollments e join courses c on c.id = e.course_id)
  from weeks w
  left join s on s.week = w.week
  left join t on t.week = w.week
  where exists (select 1 from inst)
  order by w.week;
$$;

-- Per department per week (department null = courses without one): students
-- enrolled, students active, the average Reliance Score and the share in the
-- high band (both only when at least 3 students have a score that week, so a
-- small group can't be read as one person), and learning signals.
create function public.admin_department_weekly(p_weeks integer default 8)
returns table (
  week date, department_id uuid, students integer, active_students integer, scored_students integer,
  avg_reliance real, high_reliance_share real, sage_messages integer, practice_sets integer,
  explain_backs integer, mock_tests integer, doubts integer, avg_mastery real
)
language sql stable security definer set search_path = ''
as $$
  with inst as (
    select (select private.my_institution_id()) as id
    where (select private.is_admin())
  ),
  weeks as (
    select (date_trunc('week', (now() at time zone 'Asia/Kolkata')) - make_interval(weeks => g))::date as week
    from generate_series(0, least(greatest(p_weeks, 1), 26) - 1) g
  ),
  since as (select min(week)::timestamp at time zone 'Asia/Kolkata' as t from weeks),
  courses as (
    select c.id, c.department_id from public.courses c, inst where c.institution_id = inst.id
  ),
  depts as (
    select distinct department_id from courses
  ),
  enrolled as (
    select c.department_id, count(distinct e.student_id)::int as n
    from public.enrollments e join courses c on c.id = e.course_id
    group by 1
  ),
  events as (
    select c.department_id, cv.student_id as uid, m.created_at as at, 'msg' as kind
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    join courses c on c.id = cv.course_id
    where m.role = 'user' and m.created_at >= (select t from since)
    union all
    select c.department_id, s.student_id, s.updated_at, 'trace'
    from public.submissions s join public.assignments a on a.id = s.assignment_id join courses c on c.id = a.course_id
    where s.updated_at >= (select t from since)
    union all
    select c.department_id, ps.student_id, ps.created_at, 'practice'
    from public.practice_sets ps join courses c on c.id = ps.course_id
    where ps.created_at >= (select t from since)
    union all
    select c.department_id, eb.student_id, eb.created_at, 'explain'
    from public.explain_backs eb join courses c on c.id = eb.course_id
    where eb.created_at >= (select t from since)
    union all
    select c.department_id, mt.student_id, mt.started_at, 'mock'
    from public.mock_tests mt join courses c on c.id = mt.course_id
    where mt.started_at >= (select t from since)
    union all
    select c.department_id, d.student_id, d.created_at, 'doubt'
    from public.doubts d join courses c on c.id = d.course_id
    where d.created_at >= (select t from since)
  ),
  activity as (
    select department_id, date_trunc('week', at at time zone 'Asia/Kolkata')::date as week,
           count(distinct uid)::int as active,
           count(*) filter (where kind = 'msg')::int as msgs,
           count(*) filter (where kind = 'practice')::int as practice,
           count(*) filter (where kind = 'explain')::int as explain,
           count(*) filter (where kind = 'mock')::int as mock,
           count(*) filter (where kind = 'doubt')::int as doubt
    from events group by 1, 2
  ),
  -- One score per student per department-week: the higher of their courses'
  -- (the same rule as the teacher's students table).
  scores as (
    select c.department_id, wm.week, wm.student_id, max(wm.reliance_score) as score
    from public.weekly_metrics wm join courses c on c.id = wm.course_id
    where wm.week >= (select min(week) from weeks)
    group by 1, 2, 3
  ),
  reliance as (
    select department_id, week, count(*)::int as n, avg(score)::real as avg_score,
           (count(*) filter (where score >= 70))::real / count(*) as high_share
    from scores group by 1, 2
  ),
  mastery as (
    select c.department_id, date_trunc('week', tm.updated_at at time zone 'Asia/Kolkata')::date as week,
           count(distinct tm.student_id)::int as n, avg(tm.mastery)::real as avg_mastery
    from public.topic_mastery tm join courses c on c.id = tm.course_id
    where tm.updated_at >= (select t from since)
    group by 1, 2
  )
  select w.week, d.department_id, coalesce(en.n, 0), coalesce(a.active, 0), coalesce(r.n, 0),
         case when r.n >= 3 then r.avg_score end,
         case when r.n >= 3 then r.high_share end,
         coalesce(a.msgs, 0), coalesce(a.practice, 0), coalesce(a.explain, 0), coalesce(a.mock, 0),
         coalesce(a.doubt, 0),
         case when ma.n >= 3 then ma.avg_mastery end
  from weeks w
  cross join depts d
  left join enrolled en on en.department_id is not distinct from d.department_id
  left join activity a on a.department_id is not distinct from d.department_id and a.week = w.week
  left join reliance r on r.department_id is not distinct from d.department_id and r.week = w.week
  left join mastery ma on ma.department_id is not distinct from d.department_id and ma.week = w.week
  where exists (select 1 from inst)
  order by w.week, d.department_id nulls last;
$$;

-- AI calls and tokens per week, feature and the caller's role.
create function public.admin_ai_usage(p_weeks integer default 8)
returns table (
  week date, feature text, user_role text, calls integer, failed integer,
  input_tokens bigint, output_tokens bigint
)
language sql stable security definer set search_path = ''
as $$
  select date_trunc('week', au.created_at at time zone 'Asia/Kolkata')::date,
         au.feature, coalesce(p.role::text, 'system'),
         count(*)::int, (count(*) filter (where not au.ok))::int,
         sum(au.input_tokens)::bigint, sum(au.output_tokens)::bigint
  from public.ai_usage au
  left join public.profiles p on p.id = au.user_id
  where (select private.is_admin())
    and au.institution_id = (select private.my_institution_id())
    and au.created_at >= (date_trunc('week', (now() at time zone 'Asia/Kolkata'))
                          - make_interval(weeks => least(greatest(p_weeks, 1), 26) - 1)) at time zone 'Asia/Kolkata'
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- One row per course: sizes, activity in the last 7 days, the latest week's
-- average Reliance Score (3+ scored students), open flags and assignments
-- whose settings are looser than the policy that now applies.
create function public.admin_courses()
returns table (
  id uuid, name text, code text, department_id uuid, teacher_id uuid, teacher_name text,
  students integer, active_students_7d integer, assignments integer, avg_reliance real,
  open_flags integer, outside_policy integer, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.code, c.department_id, c.teacher_id, coalesce(tp.full_name, ''),
         (select count(*)::int from public.enrollments e where e.course_id = c.id),
         (select count(distinct cv.student_id)::int
            from public.messages m join public.conversations cv on cv.id = m.conversation_id
            where cv.course_id = c.id and m.role = 'user' and m.created_at >= now() - interval '7 days'),
         (select count(*)::int from public.assignments a where a.course_id = c.id),
         (select case when count(*) >= 3 then avg(x.score)::real end
            from (select wm.student_id, max(wm.reliance_score) as score
                  from public.weekly_metrics wm
                  where wm.course_id = c.id
                    and wm.week = (select max(week) from public.weekly_metrics w2 where w2.course_id = c.id)
                  group by 1) x),
         (select count(*)::int from public.flags f where f.course_id = c.id and f.status = 'open'),
         (select count(*)::int
            from public.assignments a, private.course_policy(c.id) p
            where a.course_id = c.id and not p.teachers_can_loosen
              and (not (a.ai_mode = any (p.allowed_modes))
                   or (a.ai_mode <> 'exam' and (a.max_hint_level > p.max_hint_level
                                                or (a.worked_examples and not p.worked_examples))))),
         c.created_at
  from public.courses c
  left join public.profiles tp on tp.id = c.teacher_id
  where (select private.is_admin())
    and c.institution_id = (select private.my_institution_id())
  order by c.name;
$$;

revoke all on function public.admin_set_teacher_department(uuid, uuid) from public, anon;
revoke all on function public.admin_set_course_department(uuid, uuid) from public, anon;
revoke all on function public.admin_staff() from public, anon;
revoke all on function public.admin_adoption(integer) from public, anon;
revoke all on function public.admin_department_weekly(integer) from public, anon;
revoke all on function public.admin_ai_usage(integer) from public, anon;
revoke all on function public.admin_courses() from public, anon;
grant execute on function public.admin_set_teacher_department(uuid, uuid) to authenticated;
grant execute on function public.admin_set_course_department(uuid, uuid) to authenticated;
grant execute on function public.admin_staff() to authenticated;
grant execute on function public.admin_adoption(integer) to authenticated;
grant execute on function public.admin_department_weekly(integer) to authenticated;
grant execute on function public.admin_ai_usage(integer) to authenticated;
grant execute on function public.admin_courses() to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
