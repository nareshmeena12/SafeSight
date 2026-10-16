-- S1: profiles and roles.
-- One row per auth user. The role decides which app a user lands in after login.
-- S3 adds institutions and the rest of the schema (PLAN.md §8) and links
-- profiles.institution_id to it.

create type public.user_role as enum ('student', 'teacher', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  institution_id uuid,
  role public.user_role not null default 'student',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per logged-in user; role drives routing and access.';

alter table public.profiles enable row level security;

-- Users can read their own profile. Teacher access to their students' profiles
-- arrives with courses and enrollments in S3.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- No insert/update/delete policies: profiles are created by the trigger below
-- and roles are changed only with the service role, so nobody can promote
-- themselves to teacher or admin from the browser.

-- Create a profile when a user signs up. Sign-up may ask for 'student' or
-- 'teacher'; 'admin' (and anything else) is never accepted from user input.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case when requested = 'teacher' then 'teacher'::public.user_role
         else 'student'::public.user_role end,
    coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
