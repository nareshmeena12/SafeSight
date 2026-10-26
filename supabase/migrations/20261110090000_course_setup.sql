-- S22 (ROADMAP.md): 10-minute course setup.
--
-- 1. course_syllabi: the syllabus a teacher uploaded or pasted, what SafeSight
--    read from it (a draft topic map the teacher reviews before saving) and
--    the suggested assignments. Teacher-only; written by the server.
-- 2. course_units / course_topics / course_outcomes: the saved, editable topic
--    map and course outcomes (COs). The course teacher manages them (through
--    save_course_topic_map, one transaction); enrolled students may read them.
-- 3. course_topic_materials: uploaded notes linked to topics (pages where the
--    topic appears). Computed by the server, readable like the topics.
-- 4. course_invites: a class list imported from CSV (name, email, roll number).
--    The invited student is enrolled when they sign up or sign in with that
--    email (claim_course_invites). Teachers read and remove their invites;
--    a student reads the invites sent to their own email.

-- ---------------------------------------------------------------- 1. syllabus

create table public.course_syllabi (
  course_id uuid primary key references public.courses (id) on delete cascade,
  source text not null check (source in ('pdf', 'text')),
  -- Storage path in course-materials when the syllabus was a PDF.
  file_path text,
  file_name text not null default '' check (char_length(file_name) <= 200),
  -- The text the model read (cut to 60,000 characters).
  source_text text not null default '' check (char_length(source_text) <= 60000),
  -- {courseName, courseCode, units: [{title, topics[]}], outcomes: [{code, description}]}
  extracted jsonb,
  extracted_at timestamptz,
  -- When the teacher last saved a topic map from it (null = not reviewed yet).
  applied_at timestamptz,
  -- [{id, unit, title, instructions, aiMode, why, outcomes[], status}]
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  suggested_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.course_syllabi is
  'A course''s syllabus, the topic map read from it and suggested assignments. Teacher-only; server-written.';

alter table public.course_syllabi enable row level security;

create policy "course_syllabi: course teacher reads"
  on public.course_syllabi for select to authenticated
  using ((select private.is_course_teacher(course_id)));

-- ---------------------------------------------------------------- 2. topic map

create table public.course_units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position smallint not null check (position between 0 and 49),
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (id, course_id)
);
comment on table public.course_units is 'Units of a course''s topic map, in order.';
create index course_units_course_idx on public.course_units (course_id, position);

create table public.course_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  unit_id uuid not null,
  position smallint not null check (position between 0 and 99),
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (id, course_id),
  -- A topic's unit is always in the same course.
  foreign key (unit_id, course_id) references public.course_units (id, course_id) on delete cascade
);
comment on table public.course_topics is 'Topics of a course, grouped by unit.';
create index course_topics_course_idx on public.course_topics (course_id);
create index course_topics_unit_idx on public.course_topics (unit_id, position);

create table public.course_outcomes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position smallint not null check (position between 0 and 49),
  code text not null check (char_length(code) between 1 and 16),
  description text not null check (char_length(description) between 1 and 600),
  created_at timestamptz not null default now()
);
comment on table public.course_outcomes is 'Course outcomes (CO1, CO2, …) for a course.';
create index course_outcomes_course_idx on public.course_outcomes (course_id, position);

alter table public.course_units enable row level security;
alter table public.course_topics enable row level security;
alter table public.course_outcomes enable row level security;

create policy "course_units: teacher and students read"
  on public.course_units for select to authenticated
  using ((select private.is_course_teacher(course_id)) or (select private.is_enrolled(course_id)));
create policy "course_units: teacher manages"
  on public.course_units for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

create policy "course_topics: teacher and students read"
  on public.course_topics for select to authenticated
  using ((select private.is_course_teacher(course_id)) or (select private.is_enrolled(course_id)));
create policy "course_topics: teacher manages"
  on public.course_topics for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

create policy "course_outcomes: teacher and students read"
  on public.course_outcomes for select to authenticated
  using ((select private.is_course_teacher(course_id)) or (select private.is_enrolled(course_id)));
create policy "course_outcomes: teacher manages"
  on public.course_outcomes for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));

-- ---------------------------------------------------------------- 3. notes per topic

create table public.course_topic_materials (
  topic_id uuid not null,
  course_id uuid not null,
  material_id uuid not null references public.materials (id) on delete cascade,
  pages integer[] not null default '{}',
  score real not null default 0,
  created_at timestamptz not null default now(),
  primary key (topic_id, material_id),
  foreign key (topic_id, course_id) references public.course_topics (id, course_id) on delete cascade
);
comment on table public.course_topic_materials is
  'Uploaded notes linked to a topic, with the pages where it appears. Server-written.';
create index course_topic_materials_course_idx on public.course_topic_materials (course_id);
create index course_topic_materials_material_idx on public.course_topic_materials (material_id);

alter table public.course_topic_materials enable row level security;

create policy "course_topic_materials: teacher and students read"
  on public.course_topic_materials for select to authenticated
  using ((select private.is_course_teacher(course_id)) or (select private.is_enrolled(course_id)));
-- No write policies: the server links notes after checking the teacher under RLS.

-- Saves the whole topic map in one transaction, keeping the ids of units,
-- topics and outcomes the editor sent back (so linked notes survive edits).
-- Runs as the caller: row-level security still decides what may change.
--   p_units:    [{id?, title, topics: [{id?, title}]}]
--   p_outcomes: [{id?, code, description}]
create function public.save_course_topic_map(p_course_id uuid, p_units jsonb, p_outcomes jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  u record;
  t record;
  o record;
  v_unit_id uuid;
  v_id uuid;
  keep_units uuid[];
  keep_topics uuid[];
  keep_outcomes uuid[];
begin
  if not (select private.is_course_teacher(p_course_id)) then
    raise exception 'only the course teacher can change its topic map' using errcode = '42501';
  end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception 'units and outcomes must be arrays' using errcode = '22023';
  end if;

  -- Ids the editor kept that really belong to this course.
  select coalesce(array_agg(cu.id), '{}') into keep_units
  from public.course_units cu
  where cu.course_id = p_course_id
    and cu.id::text in (select x->>'id' from jsonb_array_elements(p_units) x);

  select coalesce(array_agg(ct.id), '{}') into keep_topics
  from public.course_topics ct
  where ct.course_id = p_course_id
    and ct.id::text in (
      select y->>'id' from jsonb_array_elements(p_units) x, jsonb_array_elements(x->'topics') y
    );

  select coalesce(array_agg(co.id), '{}') into keep_outcomes
  from public.course_outcomes co
  where co.course_id = p_course_id
    and co.id::text in (select x->>'id' from jsonb_array_elements(p_outcomes) x);

  delete from public.course_topics where course_id = p_course_id and not (id = any (keep_topics));
  -- Kept topics are moved to their (possibly new) unit in the loop below,
  -- before old units are removed (removing a unit cascades to its topics).

  for u in select value as j, ordinality - 1 as pos from jsonb_array_elements(p_units) with ordinality loop
    v_id := nullif(u.j->>'id', '')::uuid;
    if v_id is not null and v_id = any (keep_units) then
      update public.course_units set title = u.j->>'title', position = u.pos where id = v_id;
      v_unit_id := v_id;
    else
      insert into public.course_units (course_id, position, title)
      values (p_course_id, u.pos, u.j->>'title')
      returning id into v_unit_id;
      keep_units := keep_units || v_unit_id;
    end if;

    for t in select value as j, ordinality - 1 as pos from jsonb_array_elements(coalesce(u.j->'topics', '[]'::jsonb)) with ordinality loop
      v_id := nullif(t.j->>'id', '')::uuid;
      if v_id is not null and v_id = any (keep_topics) then
        update public.course_topics
        set title = t.j->>'title', position = t.pos, unit_id = v_unit_id
        where id = v_id;
        -- The same topic sent twice: keep the first.
        keep_topics := array_remove(keep_topics, v_id);
      else
        insert into public.course_topics (course_id, unit_id, position, title)
        values (p_course_id, v_unit_id, t.pos, t.j->>'title');
      end if;
    end loop;
  end loop;

  delete from public.course_units where course_id = p_course_id and not (id = any (keep_units));

  delete from public.course_outcomes where course_id = p_course_id and not (id = any (keep_outcomes));
  for o in select value as j, ordinality - 1 as pos from jsonb_array_elements(p_outcomes) with ordinality loop
    v_id := nullif(o.j->>'id', '')::uuid;
    if v_id is not null and v_id = any (keep_outcomes) then
      update public.course_outcomes
      set code = o.j->>'code', description = o.j->>'description', position = o.pos
      where id = v_id;
      keep_outcomes := array_remove(keep_outcomes, v_id);
    else
      insert into public.course_outcomes (course_id, position, code, description)
      values (p_course_id, o.pos, o.j->>'code', o.j->>'description');
    end if;
  end loop;
end;
$$;

revoke all on function public.save_course_topic_map(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_course_topic_map(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- 4. invites

create table public.course_invites (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  full_name text not null default '' check (char_length(full_name) <= 120),
  roll_number text check (roll_number is null or roll_number ~ '^[A-Z0-9/-]{1,32}$'),
  status text not null default 'pending' check (status in ('pending', 'joined')),
  -- queued = the email will go out in the background; not_configured = no email provider, share the link by hand.
  email_status text not null default 'queued'
    check (email_status in ('queued', 'sent', 'failed', 'not_configured')),
  emailed_at timestamptz,
  student_id uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, email)
);
comment on table public.course_invites is
  'Class-list invites from a CSV import. The student is enrolled when they sign up or sign in with the email.';
create index course_invites_email_idx on public.course_invites (email) where status = 'pending';
create index course_invites_inviter_idx on public.course_invites (invited_by, created_at);

alter table public.course_invites enable row level security;

create policy "course_invites: course teacher reads"
  on public.course_invites for select to authenticated
  using ((select private.is_course_teacher(course_id)));

create policy "course_invites: course teacher removes"
  on public.course_invites for delete to authenticated
  using ((select private.is_course_teacher(course_id)));

create policy "course_invites: student reads own"
  on public.course_invites for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email'));
-- No insert/update policies: the server writes invites after checking the teacher.

-- Enrols the signed-in student in every course that invited their (confirmed)
-- email, fills their roll number if it is empty, and marks the invites joined.
-- Returns how many courses were joined.
create function public.claim_course_invites()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    return 0;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'student') then
    return 0;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for r in
    select id, course_id, roll_number from public.course_invites
    where email = v_email and status = 'pending'
    order by created_at
  loop
    insert into public.enrollments (course_id, student_id) values (r.course_id, v_uid) on conflict do nothing;
    update public.course_invites
    set status = 'joined', student_id = v_uid, joined_at = now(), updated_at = now()
    where id = r.id;
    if r.roll_number is not null then
      update public.profiles set roll_number = r.roll_number where id = v_uid and roll_number is null;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.claim_course_invites() from public, anon;
grant execute on function public.claim_course_invites() to authenticated;

-- For the roster import (service role only): which of these emails already
-- have a SafeSight account, and with what role.
create function public.profiles_by_email(p_emails text[])
returns table (id uuid, email text, role public.user_role, roll_number text)
language sql stable security definer set search_path = ''
as $$
  select p.id, lower(u.email)::text, p.role, p.roll_number
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = any (select lower(e) from unnest(p_emails) e);
$$;

revoke all on function public.profiles_by_email(text[]) from public, anon, authenticated;
grant execute on function public.profiles_by_email(text[]) to service_role;
