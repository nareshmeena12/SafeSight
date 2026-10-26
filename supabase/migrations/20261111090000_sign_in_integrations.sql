-- S25: sign-in (Google / Microsoft) and LMS imports.
--
-- 1. Roles. profiles.role stays the source of truth (every policy reads it);
--    it is now mirrored into auth.users.raw_app_meta_data.role, which only the
--    service role can write, so the role travels in the JWT. A role put in
--    app_metadata by the service role (admin.createUser / updateUserById)
--    becomes the profile role (two-way sync). Self-chosen 'teacher' is accepted only for
--    email + password sign-ups: Google / Microsoft (SSO) sign-ups start as
--    students unless an admin invited them (staff_invites).
-- 2. Allowed email domains per institution. A confirmed account whose email
--    domain belongs to an institution joins that institution. With
--    institutions.sign_up_domains_only on, nobody outside those domains can
--    join the institution's courses with a class code or be invited as staff.
-- 3. staff_invites: an admin invites a teacher (or admin) by email; the role
--    is applied by apply_account_claims() once that email is confirmed.
-- 4. course_external_links: which Google Classroom / Moodle course a
--    SafeSight course was imported from (re-import goes to the same course).

-- ---------------------------------------------------------------- 1. domains

alter table public.institutions
  add column sign_up_domains_only boolean not null default false;
comment on column public.institutions.sign_up_domains_only is
  'When true, only emails at the institution''s domains may join its courses or be invited as staff.';

create table public.institution_email_domains (
  domain text primary key
    check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and char_length(domain) <= 253),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.institution_email_domains is
  'Email domains that belong to an institution (e.g. college.edu.in). A domain belongs to one institution. Server-written.';
create index institution_email_domains_institution_idx on public.institution_email_domains (institution_id);

alter table public.institution_email_domains enable row level security;

create policy "institution_email_domains: members read"
  on public.institution_email_domains for select to authenticated
  using (institution_id = (select private.my_institution_id()));

-- The institution whose domain (or a parent domain: students.college.edu.in
-- matches college.edu.in) the email is at; the longest match wins.
create function private.institution_for_email(p_email text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select d.institution_id
  from public.institution_email_domains d
  where lower(split_part(p_email, '@', 2)) = d.domain
     or lower(split_part(p_email, '@', 2)) like '%.' || d.domain
  order by char_length(d.domain) desc
  limit 1;
$$;

-- True unless the institution limits itself to its own domains and the email isn't at one.
create function private.email_allowed_for_institution(p_email text, p_institution uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_institution is null
    or not coalesce((select sign_up_domains_only from public.institutions where id = p_institution), false)
    or exists (
      select 1 from public.institution_email_domains d
      where d.institution_id = p_institution
        and (lower(split_part(p_email, '@', 2)) = d.domain
             or lower(split_part(p_email, '@', 2)) like '%.' || d.domain)
    );
$$;

create function private.is_institution_admin(p_institution uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and institution_id = p_institution
  );
$$;

revoke all on function private.institution_for_email(text) from public;
revoke all on function private.email_allowed_for_institution(text, uuid) from public;
revoke all on function private.is_institution_admin(uuid) from public;
grant execute on function private.institution_for_email(text) to authenticated;
grant execute on function private.email_allowed_for_institution(text, uuid) to authenticated;
grant execute on function private.is_institution_admin(uuid) to authenticated;

-- ---------------------------------------------------------------- 2. staff invites

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%' and char_length(email) <= 320),
  role public.user_role not null check (role in ('teacher', 'admin')),
  full_name text not null default '' check (char_length(full_name) <= 120),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  email_status text not null default 'not_configured'
    check (email_status in ('queued', 'sent', 'failed', 'not_configured')),
  invited_by uuid references public.profiles (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.staff_invites is
  'An admin''s invitation for an email to become a teacher (or admin) of their institution. Server-written.';
create unique index staff_invites_pending_email_idx on public.staff_invites (email) where status = 'pending';
create index staff_invites_institution_idx on public.staff_invites (institution_id, created_at desc);

alter table public.staff_invites enable row level security;

create policy "staff_invites: institution admin reads"
  on public.staff_invites for select to authenticated
  using ((select private.is_institution_admin(institution_id)));

create policy "staff_invites: invitee reads own"
  on public.staff_invites for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email'));

-- ---------------------------------------------------------------- 3. roles in app_metadata

create function private.sync_role_to_app_metadata()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
  where id = new.id
    and (raw_app_meta_data ->> 'role') is distinct from new.role::text;
  return new;
end;
$$;

create trigger profiles_sync_role
  after insert or update of role on public.profiles
  for each row execute function private.sync_role_to_app_metadata();

-- And the other way: a role the service role writes into app_metadata
-- (admin.updateUserById / createUser) becomes the profile's role. A missing
-- or unknown value is ignored (Auth rewrites a new SSO user's app_metadata
-- without it).
create function private.sync_role_from_app_metadata()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('student', 'teacher', 'admin') then
    update public.profiles set role = v_role::public.user_role
    where id = new.id and role is distinct from v_role::public.user_role;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when ((new.raw_app_meta_data ->> 'role') is distinct from (old.raw_app_meta_data ->> 'role'))
  execute function private.sync_role_from_app_metadata();

update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text)
from public.profiles p
where p.id = u.id and (u.raw_app_meta_data ->> 'role') is distinct from p.role::text;

-- Sign-up trigger: same as S1, plus the rules above. Google and Microsoft put
-- the person's name in `full_name` or `name`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
  granted text := new.raw_app_meta_data ->> 'role';
  provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_role public.user_role;
begin
  v_role := case
    when granted in ('student', 'teacher', 'admin') then granted::public.user_role
    -- OAuth identity data carries the issuer and subject; only a plain
    -- email + password sign-up may ask to be a teacher.
    when provider = 'email' and requested = 'teacher'
         and not (new.raw_user_meta_data ? 'iss' or new.raw_user_meta_data ? 'provider_id')
      then 'teacher'::public.user_role
    else 'student'::public.user_role
  end;
  insert into public.profiles (id, role, full_name, institution_id)
  values (
    new.id,
    v_role,
    coalesce(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), 120), ''),
    case when new.email_confirmed_at is not null then private.institution_for_email(new.email) end
  );
  return new;
end;
$$;

-- Applies what an account is owed once its email is confirmed: a pending
-- staff invite (raises the role, never lowers it) and the institution its
-- email domain belongs to. Runs after every sign-in (SSO callback, email
-- link, password log-in). Returns the role and whether anything changed.
create function public.apply_account_claims()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_profile public.profiles%rowtype;
  v_invite public.staff_invites%rowtype;
  v_role public.user_role;
  v_institution uuid;
  v_changed boolean := false;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return null;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return jsonb_build_object('role', v_profile.role, 'changed', false);
  end if;
  v_role := v_profile.role;
  v_institution := v_profile.institution_id;

  select * into v_invite from public.staff_invites
  where email = v_email and status = 'pending'
  order by created_at desc limit 1;
  -- An invite from another institution doesn't move someone who already works for one.
  if found and (v_institution is null or v_institution = v_invite.institution_id or v_role = 'student')
     and private.email_allowed_for_institution(v_email, v_invite.institution_id) then
    if v_role = 'student' or (v_role = 'teacher' and v_invite.role = 'admin') then
      v_role := v_invite.role;
    end if;
    v_institution := v_invite.institution_id;
    update public.staff_invites
    set status = 'accepted', user_id = v_uid, accepted_at = now(), updated_at = now()
    where id = v_invite.id;
    v_changed := true;
  end if;

  if v_institution is null then
    v_institution := private.institution_for_email(v_email);
  end if;

  if v_role is distinct from v_profile.role or v_institution is distinct from v_profile.institution_id then
    update public.profiles set role = v_role, institution_id = v_institution where id = v_uid;
    v_changed := true;
  else
    -- Keep the JWT copy right even when nothing changed (a new SSO account's
    -- app_metadata can be rewritten by Auth right after the sign-up trigger).
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role::text)
    where id = v_uid and (raw_app_meta_data ->> 'role') is distinct from v_role::text;
    v_changed := v_changed or found;
  end if;

  return jsonb_build_object('role', v_role, 'changed', v_changed);
end;
$$;

revoke all on function public.apply_account_claims() from public, anon;
grant execute on function public.apply_account_claims() to authenticated;

-- ---------------------------------------------------------------- 4. class codes and domains

-- Same as S3, plus the institution's domain rule. The course's institution
-- (or, when the course has none, its teacher's) decides.
create or replace function public.join_course(p_join_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_course_id uuid;
  v_institution uuid;
  v_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if not exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'student'
  ) then
    raise exception 'only students can join a course';
  end if;

  select c.id, coalesce(c.institution_id, t.institution_id) into v_course_id, v_institution
  from public.courses c
  join public.profiles t on t.id = c.teacher_id
  where c.join_code = upper(trim(p_join_code));
  if v_course_id is null then
    return null;
  end if;

  select email into v_email from auth.users where id = (select auth.uid());
  if not private.email_allowed_for_institution(v_email, v_institution) then
    raise exception 'email_domain_not_allowed' using errcode = 'P0001';
  end if;

  insert into public.enrollments (course_id, student_id)
  values (v_course_id, (select auth.uid()))
  on conflict do nothing;
  return v_course_id;
end;
$$;

revoke all on function public.join_course(text) from public, anon;
grant execute on function public.join_course(text) to authenticated;

-- ---------------------------------------------------------------- 5. LMS links

create table public.course_external_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null check (provider in ('google_classroom', 'moodle')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  external_name text not null default '' check (char_length(external_name) <= 300),
  last_imported_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, provider, external_id)
);
comment on table public.course_external_links is
  'The Google Classroom / Moodle course a SafeSight course was imported from. Course teacher only.';
create index course_external_links_lookup_idx on public.course_external_links (provider, external_id);

alter table public.course_external_links enable row level security;

create policy "course_external_links: course teacher manages"
  on public.course_external_links for all to authenticated
  using ((select private.is_course_teacher(course_id)))
  with check ((select private.is_course_teacher(course_id)));
