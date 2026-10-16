-- S12: better keyword ranking for notes search.
--
-- ts_rank_cd has no notion of how rare a word is, so in a set of lecture notes
-- common words ("work", "process") outranked the page that is actually about
-- the question ("polytropic"). The keyword half of the hybrid search now
-- scores each chunk by the sum of ln((N + 1) / df) over the query words it
-- contains (N = ready chunks in the course, df = chunks containing the word),
-- with ts_rank_cd as a tie-breaker. Vector ranking and the fusion are unchanged.

create or replace function public.match_material_chunks(
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
  terms as (
    select distinct lexeme, quote_literal(lexeme)::tsquery as tsq
    from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_query, '')))) as lexeme
  ),
  df as (
    select t.lexeme, t.tsq, count(c.id) as n
    from terms t join candidates c on c.fts @@ t.tsq
    group by t.lexeme, t.tsq
  ),
  total as (
    select count(*)::double precision as n from candidates
  ),
  kw_scores as (
    select c.id, sum(ln((total.n + 1) / df.n)) + ts_rank_cd(c.fts, q.tsq) as s
    from candidates c
    cross join q
    cross join total
    join df on c.fts @@ df.tsq
    group by c.id, c.fts, q.tsq
  ),
  kw as (
    select id, row_number() over (order by s desc) as r
    from kw_scores
    order by s desc
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
