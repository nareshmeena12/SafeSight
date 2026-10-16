-- Sage safety and speed, part 2: functions that use the new intents and the
-- conversation's own course (Explore chats have no assignment).
--
-- Same bodies as 20261020070000_teacher_dashboard.sql, except:
--   * the course comes from conversations.course_id, not the assignment;
--   * deliverable_request (and legacy pasted_question) count as answer-seeking;
--   * an "attempt" message counts as an attempt for the Reliance Score's e.

-- Sage activity per enrolled student per course, from student messages in
-- [p_from, p_to). Every enrolled student gets a row, with zeros if idle.
create or replace function public.teacher_student_activity(
  p_course_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  course_id uuid,
  student_id uuid,
  conversations integer,
  messages integer,
  answer_seeking integer,
  last_active_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with activity as (
    select cv.course_id, cv.student_id, m.conversation_id, m.intent, m.created_at
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    where m.role = 'user'
      and cv.course_id in (select private.my_courses(p_course_id))
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at < p_to)
  )
  select e.course_id, e.student_id,
         count(distinct act.conversation_id)::integer,
         count(act.created_at)::integer,
         (count(*) filter (where act.intent in ('answer_seeking', 'pasted_question', 'deliverable_request')))::integer,
         max(act.created_at)
  from public.enrollments e
  left join activity act on act.course_id = e.course_id and act.student_id = e.student_id
  where e.course_id in (select private.my_courses(p_course_id))
  group by e.course_id, e.student_id;
$$;

-- Topics students ask Sage about, ranked by how much they struggle: message
-- count plus answer-seeking messages. Optionally for one student.
create or replace function public.teacher_topic_struggles(
  p_course_id uuid default null,
  p_student_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 10
)
returns table (
  topic text,
  messages integer,
  students integer,
  answer_seeking integer
)
language sql stable security definer set search_path = ''
as $$
  select min(trim(m.topic)),
         count(*)::integer,
         count(distinct cv.student_id)::integer,
         (count(*) filter (where m.intent in ('answer_seeking', 'pasted_question', 'deliverable_request')))::integer
  from public.messages m
  join public.conversations cv on cv.id = m.conversation_id
  where m.role = 'user'
    and m.topic is not null
    and cv.course_id in (select private.my_courses(p_course_id))
    and (p_student_id is null or cv.student_id = p_student_id)
    and (p_from is null or m.created_at >= p_from)
    and (p_to is null or m.created_at < p_to)
  group by lower(trim(m.topic))
  order by count(*) + count(*) filter (where m.intent in ('answer_seeking', 'pasted_question', 'deliverable_request')) desc,
           min(trim(m.topic))
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Recomputes weekly_metrics for the last p_weeks weeks (Monday-start weeks in
-- India time) and returns the number of rows written.
--
-- Reliance = 100 × (0.5·a + 0.3·p + 0.2·e), PLAN.md §4:
--   a  share of the student's messages labelled answer_seeking,
--      deliverable_request or (older rows) pasted_question
--   p  average paste_ratio of their submissions submitted that week
--   e  share of the assignments they used Sage on that week where the hint
--      ladder reached step 4 before any attempt: a student message with
--      attempted = true (classify_message) or labelled concept_question or
--      attempt. Explore chats ("Ask Sage") count towards a only.
--      Messages with no labels yet count as attempts (benefit of the doubt).
-- A part with no data that week (no messages, no submitted work) is left out
-- and the remaining weights are scaled up, so a student who only chats can
-- still score 100. Weeks with neither get no row.
--
-- Teachers may refresh their own courses. The service role (scripts, cron) may
-- refresh any course, or all with p_course_id null.
create or replace function public.refresh_weekly_metrics(
  p_course_id uuid default null,
  p_weeks integer default 8
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_service boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  v_courses uuid[];
  v_start date;
  v_rows integer;
begin
  if v_is_service then
    select array_agg(c.id) into v_courses from public.courses c
    where p_course_id is null or c.id = p_course_id;
  elsif (select auth.uid()) is not null then
    select array_agg(id) into v_courses from private.my_courses(p_course_id) as id;
  else
    raise exception 'not allowed';
  end if;

  if v_courses is null then
    return 0;
  end if;

  v_start := (date_trunc('week', now() at time zone 'Asia/Kolkata')
              - make_interval(weeks => least(greatest(coalesce(p_weeks, 8), 1), 52) - 1))::date;

  delete from public.weekly_metrics wm
  where wm.course_id = any (v_courses) and wm.week >= v_start;

  with msgs as (
    select cv.course_id, cv.student_id, cv.assignment_id, cv.id as conversation_id,
           m.role, m.intent, m.hint_level, m.attempted, m.created_at,
           date_trunc('week', m.created_at at time zone 'Asia/Kolkata')::date as week
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    where cv.course_id = any (v_courses)
  ),
  -- a: answer-seeking share of student messages, per week.
  part_a as (
    select course_id, student_id, week,
           count(*) as messages,
           (count(*) filter (where intent in ('answer_seeking', 'pasted_question', 'deliverable_request')))::real
             / count(*) as a
    from msgs
    where role = 'user' and week >= v_start
    group by course_id, student_id, week
  ),
  -- First time each student reached step 4+ on each assignment.
  step4 as (
    select course_id, student_id, assignment_id, min(created_at) as reached_at
    from msgs where hint_level >= 4 and assignment_id is not null
    group by course_id, student_id, assignment_id
  ),
  -- Assignments worked on per week, and whether step 4 came before an attempt.
  part_e_rows as (
    select w.course_id, w.student_id, w.week, w.assignment_id,
           (s.reached_at is not null and not exists (
              select 1 from msgs x
              where x.course_id = w.course_id and x.student_id = w.student_id
                and x.assignment_id = w.assignment_id and x.role = 'user'
                and x.created_at < s.reached_at
                and (x.attempted is true or x.intent in ('concept_question', 'attempt')
                     or (x.intent is null and x.attempted is null))
           )) as unearned
    from (select distinct course_id, student_id, week, assignment_id
          from msgs where role = 'user' and week >= v_start and assignment_id is not null) w
    left join step4 s on s.course_id = w.course_id and s.student_id = w.student_id
                     and s.assignment_id = w.assignment_id
  ),
  part_e as (
    select course_id, student_id, week,
           (count(*) filter (where unearned))::real / count(*) as e
    from part_e_rows
    group by course_id, student_id, week
  ),
  -- p: average paste ratio of work submitted that week.
  part_p as (
    select a.course_id, s.student_id,
           date_trunc('week', s.submitted_at at time zone 'Asia/Kolkata')::date as week,
           avg(r.paste_ratio)::real as p
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.integrity_reports r on r.submission_id = s.id
    where a.course_id = any (v_courses) and s.submitted_at is not null
      and (s.submitted_at at time zone 'Asia/Kolkata')::date >= v_start
    group by a.course_id, s.student_id, 3
  ),
  combined as (
    select coalesce(pa.course_id, pp.course_id) as course_id,
           coalesce(pa.student_id, pp.student_id) as student_id,
           coalesce(pa.week, pp.week) as week,
           coalesce(pa.messages, 0) as messages,
           coalesce(pa.a, 0) as a,
           coalesce(pe.e, 0) as e,
           pp.p,
           (pa.messages is not null) as has_chat
    from part_a pa
    left join part_e pe on pe.course_id = pa.course_id and pe.student_id = pa.student_id
                       and pe.week = pa.week
    full join part_p pp on pp.course_id = pa.course_id and pp.student_id = pa.student_id
                       and pp.week = pa.week
  )
  insert into public.weekly_metrics
    (student_id, course_id, week, messages, answer_seeking_share, reliance_score)
  select c.student_id, c.course_id, c.week, c.messages, c.a,
         round(least(100, greatest(0,
           100 * (case when c.has_chat then 0.5 * c.a + 0.2 * c.e else 0 end
                  + coalesce(0.3 * c.p, 0))
               / ((case when c.has_chat then 0.7 else 0 end)
                  + (case when c.p is not null then 0.3 else 0 end))
         ))::numeric, 1)::real
  from combined c
  -- Only students still enrolled.
  where exists (select 1 from public.enrollments en
                where en.course_id = c.course_id and en.student_id = c.student_id);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
