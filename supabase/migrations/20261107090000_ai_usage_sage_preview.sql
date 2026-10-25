-- S16 (ROADMAP.md): token usage per AI call, and teacher "Preview Sage" chats.
--
-- 1. ai_usage: one row per model call (chat or embedding) with institution,
--    user, feature and token counts. Server-written only; a user may read
--    their own rows (students see all of their own data).
-- 2. sage_preview_chats: a teacher trying Sage as a student would. Kept out of
--    conversations/messages on purpose, so previews can never reach labels,
--    flags, Reliance Scores, weekly_metrics or any dashboard number.

-- ---------------------------------------------------------------- 1. ai_usage

create table public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  institution_id uuid references public.institutions (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  -- sage_classify, sage_reply, sage_guard, sage_preview_*, lens, trace_summary, notes_search, notes_ingest, eval
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{1,40}$'),
  model text not null default '',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer generated always as (input_tokens + output_tokens) stored,
  ok boolean not null default true
);
comment on table public.ai_usage is
  'Tokens used per AI call (chat and embeddings). Written with the service role only.';
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_institution_created_idx on public.ai_usage (institution_id, created_at desc);
create index ai_usage_feature_created_idx on public.ai_usage (feature, created_at desc);

-- The writer only knows the user; the institution comes from their profile.
create function private.ai_usage_institution()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.institution_id is null and new.user_id is not null then
    new.institution_id := (select p.institution_id from public.profiles p where p.id = new.user_id);
  end if;
  return new;
end;
$$;

create trigger ai_usage_institution
  before insert on public.ai_usage
  for each row execute function private.ai_usage_institution();

alter table public.ai_usage enable row level security;

create policy "ai_usage: user reads own"
  on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert/update/delete policies: only the service role writes.

-- ---------------------------------------------------------------- 2. preview chats

create table public.sage_preview_chats (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  -- null = an Explore ("Ask Sage") preview for the course.
  assignment_id uuid references public.assignments (id) on delete cascade,
  -- [{id, clientId, role, content, hintLevel, at}], oldest first, capped by the server.
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  -- {assignmentId: {step, attempts, lastExampleAt}}: the preview's own hint ladder.
  ladder jsonb not null default '{}'::jsonb check (jsonb_typeof(ladder) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sage_preview_chats is
  'A teacher previewing Sage on their own course or assignment. Never counted in any metric.';

create unique index sage_preview_chats_target_idx on public.sage_preview_chats
  (teacher_id, course_id, coalesce(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index sage_preview_chats_course_idx on public.sage_preview_chats (course_id);
create index sage_preview_chats_assignment_idx on public.sage_preview_chats (assignment_id);

alter table public.sage_preview_chats enable row level security;

create policy "sage_preview_chats: teacher reads own"
  on public.sage_preview_chats for select to authenticated
  using (teacher_id = (select auth.uid()) and (select private.is_course_teacher(course_id)));
create policy "sage_preview_chats: teacher deletes own"
  on public.sage_preview_chats for delete to authenticated
  using (teacher_id = (select auth.uid()) and (select private.is_course_teacher(course_id)));
-- No insert/update policies: the preview route writes with the service role.

grant select, delete on public.sage_preview_chats to authenticated;
grant select on public.ai_usage to authenticated;
