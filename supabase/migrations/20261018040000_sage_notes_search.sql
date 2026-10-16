-- S4–S6: Sage chat, labels and flags, notes search.
--
-- 1. Teacher notes become teacher-only. They move out of public.assignments
--    (which enrolled students can read) into their own table that only the
--    course teacher can read or write. Sage reads them with the service role.
-- 2. Extra labels on messages (topic, attempted) and cited pages (citations).
-- 3. Material processing status, keyword search on chunks, and a hybrid
--    (vector + keyword) search function.
-- 4. A private Storage bucket for course PDFs, laid out as <course_id>/<file>.

-- ---------------------------------------------------------------- 1. teacher notes

create table public.assignment_teacher_notes (
  assignment_id uuid primary key references public.assignments (id) on delete cascade,
  -- Guidance for Sage. Only the course teacher (and the server) can read it.
  notes text not null default '' check (length(notes) <= 4000),
  updated_at timestamptz not null default now()
);
comment on table public.assignment_teacher_notes is
  'Teacher-only guidance for Sage on an assignment. Students never read it.';

insert into public.assignment_teacher_notes (assignment_id, notes)
select id, teacher_notes from public.assignments where teacher_notes <> '';

alter table public.assignments drop column teacher_notes;

alter table public.assignment_teacher_notes enable row level security;

create policy "assignment_teacher_notes: teacher manages"
  on public.assignment_teacher_notes for all to authenticated
  using ((select private.is_course_teacher(private.course_of_assignment(assignment_id))))
  with check ((select private.is_course_teacher(private.course_of_assignment(assignment_id))));

-- ---------------------------------------------------------------- 2. message labels

alter table public.messages
  -- Short concept label from classify_message, e.g. "first law sign convention".
  add column topic text check (length(topic) <= 80),
  -- classify_message: the student showed real work of their own in this message.
  add column attempted boolean,
  -- Pages Sage cited in an assistant reply: [{materialId, title, page}].
  add column citations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(citations) = 'array');

-- Students still may only add plain user messages; every label is server-written.
drop policy "messages: student writes own" on public.messages;
create policy "messages: student writes own"
  on public.messages for insert to authenticated
  with check (
    (select private.owns_conversation(conversation_id))
    and role = 'user' and intent is null and hint_level is null
    and topic is null and attempted is null and citations = '[]'::jsonb
  );

-- ---------------------------------------------------------------- 3. materials and search

alter table public.materials
  add column status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  add column page_count integer check (page_count >= 0),
  add column error text check (length(error) <= 500);

alter table public.material_chunks
  add column fts tsvector generated always as (to_tsvector('english', content)) stored;
create index material_chunks_fts_idx on public.material_chunks using gin (fts);

-- Hybrid search over one course's ready materials: keyword ranking always,
-- plus vector ranking when a query embedding is given, fused by reciprocal
-- rank. Security invoker: row-level security on materials and chunks applies
-- to signed-in callers; the server calls it with the service role after
-- checking enrollment.
create function public.match_material_chunks(
  p_course_id uuid,
  p_query text,
  p_embedding extensions.vector(1024) default null,
  p_match_count integer default 4
)
returns table (
  id uuid,
  material_id uuid,
  title text,
  page integer,
  content text,
  score double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
  with q as (
    -- OR the words together so a long question still matches.
    select nullif(replace(plainto_tsquery('english', coalesce(p_query, ''))::text, '&', '|'), '')::tsquery as tsq
  ),
  candidates as (
    select c.id, c.embedding, c.fts
    from public.material_chunks c
    join public.materials m on m.id = c.material_id
    where m.course_id = p_course_id and m.status = 'ready'
  ),
  vec as (
    select id, row_number() over (order by embedding <=> p_embedding) as r
    from candidates
    where p_embedding is not null and embedding is not null
    order by embedding <=> p_embedding
    limit 20
  ),
  kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as r
    from candidates c, q
    where q.tsq is not null and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc
    limit 20
  ),
  fused as (
    select u.id, sum(1.0 / (60 + u.r)) as score
    from (select * from vec union all select * from kw) u
    group by u.id
  )
  select c.id, c.material_id, m.title, c.page, c.content, f.score::double precision
  from fused f
  join public.material_chunks c on c.id = f.id
  join public.materials m on m.id = c.material_id
  order by f.score desc
  limit least(greatest(coalesce(p_match_count, 4), 1), 10);
$$;

revoke all on function public.match_material_chunks(uuid, text, extensions.vector, integer) from public, anon;
grant execute on function public.match_material_chunks(uuid, text, extensions.vector, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------- 4. storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- The course id is the first folder of the object name; null if it isn't a uuid.
create function private.course_of_object(p_name text)
returns uuid language plpgsql immutable set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
revoke all on function private.course_of_object(text) from public;
grant execute on function private.course_of_object(text) to authenticated;

create policy "course-materials: teacher uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'course-materials'
    and private.is_course_teacher(private.course_of_object(name))
  );
create policy "course-materials: course members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      private.is_course_teacher(private.course_of_object(name))
      or private.is_enrolled(private.course_of_object(name))
    )
  );
create policy "course-materials: teacher deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'course-materials'
    and private.is_course_teacher(private.course_of_object(name))
  );
