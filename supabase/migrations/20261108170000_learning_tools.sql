-- Student learning tools (S17): practice, explain it back, session recaps,
-- the mistake log, prerequisite refreshers and mastery per topic.
--
-- Everything here is the student's own learning record. Students read their
-- own rows; the server (service role) writes them. Teachers see only
-- topic_mastery for their courses — a summary, never what the student wrote.
--
-- Topics are keyed by a normalised label (lower case, single spaces, no
-- punctuation), so "First law: sign convention" and "first law sign
-- convention" are the same topic.
--
-- ai_usage is shared by every AI feature: tokens per call, with institution,
-- user and feature. Created here if no other migration created it first.

-- ---------------------------------------------------------------- ai_usage

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  institution_id uuid references public.institutions (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  -- e.g. sage_classify, sage_reply, sage_guard, practice_generate, practice_grade, recap.
  feature text not null check (length(feature) <= 60),
  model text check (length(model) <= 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0)
);
comment on table public.ai_usage is
  'Tokens used per AI call (institution, user, feature). Server-written; also used for per-user rate limits.';
create index if not exists ai_usage_user_feature_idx on public.ai_usage (user_id, feature, created_at desc);
create index if not exists ai_usage_institution_idx on public.ai_usage (institution_id, created_at desc);

alter table public.ai_usage enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_usage' and policyname = 'ai_usage: user reads own'
  ) then
    create policy "ai_usage: user reads own"
      on public.ai_usage for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end;
$$;

-- ---------------------------------------------------------------- practice

create type public.practice_kind as enum (
  -- "Practice this": 3 new problems on a concept, easy → hard.
  'practice',
  -- "Review before exam": problems aimed at the student's mistake log and weak topics.
  'review',
  -- Prerequisite refresher: a short lesson on a missing basic skill + 2 quick checks.
  'refresher'
);

create table public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  kind public.practice_kind not null default 'practice',
  topic text not null check (length(topic) between 1 and 120),
  topic_key text not null check (length(topic_key) between 1 and 120),
  -- Refreshers: the basic skill and a short lesson (Markdown).
  skill text check (length(skill) <= 120),
  lesson text check (length(lesson) <= 4000),
  -- Where it was started: explore (a Sage chat), learning (My learning), sage (a refresher offer in a chat).
  source text not null default 'learning' check (source in ('explore', 'learning', 'sage')),
  -- Review sets: the mistake_patterns ids they aim at (marked reviewed when the set goes well).
  targets uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Mean score of the graded items (0–1), once complete.
  score real check (score between 0 and 1)
);
comment on table public.practice_sets is
  'Practice, review and refresher sets. Never linked to graded assignments. Student reads own; server writes.';
create index practice_sets_student_idx on public.practice_sets (student_id, created_at desc);
create index practice_sets_course_idx on public.practice_sets (course_id);

create table public.practice_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.practice_sets (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  difficulty text not null check (difficulty in ('warm_up', 'standard', 'stretch', 'check')),
  -- Review sets mix topics: the topic this item practises (null = the set's topic).
  topic text check (length(topic) <= 120),
  -- open: a written answer graded with feedback. choice: a quick check with options.
  format text not null default 'open' check (format in ('open', 'choice')),
  question text not null check (length(question) between 1 and 3000),
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  -- Filled in when the student answers.
  answer text check (length(answer) <= 4000),
  choice smallint,
  score real check (score between 0 and 1),
  verdict text check (verdict in ('correct', 'partly', 'not_yet')),
  feedback text check (length(feedback) <= 2000),
  -- The worked solution, copied here from the key only after the student answered.
  solution text check (length(solution) <= 4000),
  answered_at timestamptz,
  unique (set_id, position)
);
comment on table public.practice_items is
  'Questions of a practice set and the student''s graded answers. Solutions appear only after answering.';

-- The worked solutions before the student answers. No policies: server only.
create table public.practice_item_keys (
  item_id uuid primary key references public.practice_items (id) on delete cascade,
  solution text not null check (length(solution) <= 4000),
  final_answer text not null default '' check (length(final_answer) <= 500),
  correct_choice smallint
);
comment on table public.practice_item_keys is
  'Worked solutions of practice items before they are answered. Server only (RLS on, no policies).';

-- ---------------------------------------------------------------- explain it back

create table public.explain_backs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  topic text not null check (length(topic) between 1 and 120),
  topic_key text not null check (length(topic_key) between 1 and 120),
  explanation text not null check (length(explanation) between 1 and 3000),
  score real not null check (score between 0 and 1),
  feedback text not null check (length(feedback) <= 2000),
  gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(gaps) = 'array'),
  created_at timestamptz not null default now()
);
comment on table public.explain_backs is
  'The student''s own explanation of an idea after a problem, with short feedback. Student reads own; server writes.';
create index explain_backs_student_idx on public.explain_backs (student_id, created_at desc);

-- ---------------------------------------------------------------- session recaps

create table public.sage_recaps (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  -- 3–5 "What you learned" bullets.
  learned jsonb not null check (jsonb_typeof(learned) = 'array'),
  -- 3 flashcards: [{front, back}].
  flashcards jsonb not null check (jsonb_typeof(flashcards) = 'array'),
  -- The chat messages this recap covers (a long chat gets one recap per stretch).
  from_at timestamptz not null,
  to_at timestamptz not null,
  messages integer not null check (messages >= 0),
  created_at timestamptz not null default now()
);
comment on table public.sage_recaps is
  '"What you learned" bullets and flashcards for a stretch of a Sage chat. Student reads own; server writes.';
create index sage_recaps_student_idx on public.sage_recaps (student_id, created_at desc);
create index sage_recaps_conversation_idx on public.sage_recaps (conversation_id, to_at desc);

-- ---------------------------------------------------------------- mistake log

create table public.mistake_patterns (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  -- e.g. "sign errors in entropy change".
  label text not null check (length(label) between 1 and 120),
  label_key text not null check (length(label_key) between 1 and 120),
  topic text not null default '' check (length(topic) <= 120),
  topic_key text not null default '' check (length(topic_key) <= 120),
  count integer not null default 1 check (count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when the student reviewed it (a review set with it scored well).
  reviewed_at timestamptz,
  unique (student_id, course_id, label_key)
);
comment on table public.mistake_patterns is
  'Repeated error patterns Sage noticed in the student''s own working. Student reads own; server writes.';
create index mistake_patterns_student_idx on public.mistake_patterns (student_id, course_id, last_seen_at desc);

-- ---------------------------------------------------------------- mastery

create table public.topic_mastery (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_key text not null check (length(topic_key) between 1 and 120),
  topic text not null check (length(topic) between 1 and 120),
  -- 0 … 1, a running blend of practice scores, explain-backs and quick checks.
  mastery real not null check (mastery between 0 and 1),
  -- How many signals it rests on.
  evidence integer not null default 0 check (evidence >= 0),
  last_source text not null check (last_source in ('practice', 'review', 'refresher', 'explain_back')),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id, topic_key)
);
comment on table public.topic_mastery is
  'Mastery per student per course per topic. Student reads own; the course teacher reads it as a summary.';
create index topic_mastery_course_idx on public.topic_mastery (course_id);

-- Offers Sage made in a chat (a prerequisite refresher), so it isn't offered every turn.
create table public.learning_offers (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_key text not null check (length(topic_key) between 1 and 120),
  kind text not null check (kind in ('refresher')),
  offered_at timestamptz not null default now(),
  primary key (student_id, course_id, topic_key, kind)
);
comment on table public.learning_offers is
  'When Sage last offered a refresher on a topic. Student reads own; server writes.';

-- ---------------------------------------------------------------- row-level security

alter table public.practice_sets enable row level security;
alter table public.practice_items enable row level security;
alter table public.practice_item_keys enable row level security;
alter table public.explain_backs enable row level security;
alter table public.sage_recaps enable row level security;
alter table public.mistake_patterns enable row level security;
alter table public.topic_mastery enable row level security;
alter table public.learning_offers enable row level security;

create function private.owns_practice_set(p_set_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.practice_sets s
    where s.id = p_set_id and s.student_id = (select auth.uid())
  );
$$;
revoke all on function private.owns_practice_set(uuid) from public;
grant execute on function private.owns_practice_set(uuid) to authenticated;

create policy "practice_sets: student reads own"
  on public.practice_sets for select to authenticated
  using (student_id = (select auth.uid()));

create policy "practice_items: student reads own"
  on public.practice_items for select to authenticated
  using ((select private.owns_practice_set(set_id)));

-- practice_item_keys: no policies (server only).

create policy "explain_backs: student reads own"
  on public.explain_backs for select to authenticated
  using (student_id = (select auth.uid()));

create policy "sage_recaps: student reads own"
  on public.sage_recaps for select to authenticated
  using (student_id = (select auth.uid()));

create policy "mistake_patterns: student reads own"
  on public.mistake_patterns for select to authenticated
  using (student_id = (select auth.uid()));

create policy "topic_mastery: student reads own"
  on public.topic_mastery for select to authenticated
  using (student_id = (select auth.uid()));
create policy "topic_mastery: teacher reads course"
  on public.topic_mastery for select to authenticated
  using ((select private.is_course_teacher(course_id)));

create policy "learning_offers: student reads own"
  on public.learning_offers for select to authenticated
  using (student_id = (select auth.uid()));

-- No insert/update/delete policies anywhere above: only the service role writes.
