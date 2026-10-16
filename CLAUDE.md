# CLAUDE.md — SafeSight

Read this file and `PLAN.md` at the start of every session. `PLAN.md` is the product spec; this file is the working memory between sessions. Update the **Status** and **Handoff notes** sections at the end of every session.

## What we are building

SafeSight is an AI tutor for Indian colleges that coaches students instead of doing their work, and shows teachers how their class uses AI. Core idea: **guide, don't guard.**

- **Sage** — student tutor. Hint ladder, never gives the final answer to graded work in Learn mode. (PLAN.md §4)
- **Lens** — teacher assistant. Plain-English questions about the class, read-only tools, answers with tables and small charts. (PLAN.md §4)
- **Trace** — Tiptap writing editor that records typing/paste/time; teacher replay; neutral evidence summary. (PLAN.md §4)
- **Live Lab Mode** — Chrome extension for lab exams on college PCs, live seat grid. Built after the core (S13–S15).
- **Landing site** — marketing page with pilot form. Design is finished; see `design/`.

## Stack (fixed — do not swap without asking)

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript, one project for site, student app, teacher app and API routes |
| Styling | Tailwind CSS + shadcn/ui, restyled with our tokens |
| Animation | Motion (`motion/react`) |
| Charts | Recharts |
| Data, auth, files | Supabase (Postgres, Auth, Storage), pgvector for note search |
| AI | Vercel AI SDK with an OpenAI-compatible provider (base URL, key, model from env) |
| Editor | Tiptap |
| Validation | zod on every server input |
| Hosting | Vercel, auto-deploy from `main` |

Package manager: **pnpm**. Node 20+. Next.js **16** (see `AGENTS.md`: read `node_modules/next/dist/docs/` before using an API you are unsure of; `middleware.ts` is now `proxy.ts`, and Cache Components is on).

## Folder structure

```
src/
  proxy.ts                  refreshes the Supabase session; signed-out visitors of /student, /teacher → /login?next=
  app/
    layout.tsx              root layout, Geist fonts, metadata
    globals.css             design tokens as CSS variables (light/dark), Tailwind theme, type scale, focus ring, paper grain
    (marketing)/            public site (S10): layout = .ss wrapper + SiteHeader/SiteFooter; page.tsx landing, about/, privacy/
    api/pilot/route.ts      POST pilot form → zod → pilot_requests (service role), honeypot + per-IP limit
    design/                 /design: every token and component, with a System/Light/Dark preview switch
    (auth)/login, signup    auth pages (route group; split layout from design/landing/Auth.dc.html)
    auth/confirm/route.ts   email-link landing: verifies the token, redirects by role
    student/                student app (layout = AppShell + home: courses with assignments and "Continue with Sage")
    student/sage/[assignmentId]  Sage chat page (S4)
    teacher/                teacher app; admins land here too until v2
      page.tsx              overview: stat cards, Lens box, weekly trend, top topics (?course=)
      courses/, courses/[courseId]   courses, join code, assignments with AI mode picker, roster
      students/, students/[studentId] sortable table (?sort=&dir=&course=), student detail
      flags/                flags with status/type filters, resolve/reopen
      conversations/[conversationId] a flagged or shared chat (RLS decides what text shows)
      lens/                 Lens full page (?q= asks straight away, ?course= scopes it)
      materials/            upload course PDFs for notes search (S6); linked from the course page, not in the sidebar yet
    api/sage/route.ts       POST: one Sage turn (auth, rate limit, log, classify, ladder, flags, stream, save)
    api/materials/          POST create+ingest; [materialId] POST re-read / DELETE; [materialId]/file GET → signed PDF URL #page=N
    api/lens/route.ts       Lens chat (teachers only; streamText + read-only tools)
    api/cron/weekly-metrics nightly refresh_weekly_metrics (vercel.json cron, CRON_SECRET)
    student/trace/          S9: "Your writing" list + [assignmentId] Trace editor (or the submitted view with replay)
    teacher/submissions/    S9: submitted Trace work + [submissionId] replay with the evidence summary
    api/trace/[submissionId]/  S9: batch (autosave every 5s), submit (+ Trace agent via after()), report (teacher re-run)
  components/
    ui/                     shadcn/ui (radix "nova" preset), restyled to our tokens. Add more with `pnpm dlx shadcn@latest add <name>`, then restyle (see Handoff)
    auth/                   login (password + magic link) and sign-up forms (client, useActionState); field.tsx also keeps the app-style Field used on /design
    marketing/              S10: site.css (all site styles, nested under .ss), site-header, site-footer, site-theme (light/dark switch), cta-band, survey.ts (stat placeholders), team.ts, landing/* (one file per section)
    app/                    app-shell (sidebar + top bar), nav.ts (nav config per app), nav-links, mobile-nav (sheet), user-menu, page-header, page-skeleton
    product/                mode-badge, reliance-badge, stat-card, empty-state
    sage/                   sage-chat (useChat client), markdown (GFM + KaTeX + code), hint-ladder, citation-chips, care-card
    materials/              upload-form, material-actions
    teacher/                charts (Recharts), topic-list, course-filter, flag-list/flag-meta, course/assignment dialogs, join-code, refresh-metrics
    lens/                   lens-chat (useChat), tool-views (charts/tables/drafts/quiz from tool results), lens-box, markdown, suggestions
    motion/fade-up.tsx      Motion fade-up (respects reduced motion)
    logo.tsx                Logo (mark + wordmark) and LogoMark
    trace/                  S9: trace-editor (Tiptap + recorder), replay (scrubber), paste-mark, evidence-summary, trace.css
  lib/
    env.ts                  zod-checked public env
    supabase/               client.ts (browser), server.ts (RSC/actions/routes), proxy.ts, admin.ts (service role, server-only), database.types.ts (generated)
    auth/roles.ts           Role type, homeForRole, canAccess, redirectAfterLogin (pure, unit-tested)
    auth/dal.ts             getCurrentUser(), requireRole([...]) — call at the top of every protected page/route
    auth/actions.ts         login, signup, sendMagicLink, signOut server actions
    auth/join.ts            joinPendingCourse(): joins the class code typed at sign-up (metadata join_code)
    pilot/schema.ts         pilot form zod schema, form role → pilot_role mapping (unit-tested)
    auth/schemas.ts         zod schemas for the auth forms
    reliance.ts             Reliance Score bands (low < 40 ≤ medium < 70 ≤ high)
    ai/provider.ts          server-only: OpenAI-compatible chat + embedding models from env, aiStatus()
    sage/                   labels (classify schema + keyword safety net), ladder, flags, prompt, math, care, types (pure, unit-tested);
                            classify.ts + data.ts (server-only: the Sage "tools" as functions)
    materials/              chunk (pure), constants, vector, ingest + search (server-only)
    teacher/                queries.ts (read-only dashboard + Lens data), actions.ts (server actions), schemas.ts (zod), dates.ts (IST weeks), params.ts
    lens/                   model.ts (provider from env), tools.ts (7 read-only tools), prompt.ts, rate-limit.ts
    trace/                  S9: schemas, metrics, html (paste measure), replay clock, summary (template + banned words), report (Trace agent), ingest, queries
supabase/
  config.toml               local Supabase (CLI is a devDependency)
  migrations/               SQL migrations, applied in order
  migrations/…_core_schema   S3: all PLAN.md §8 tables + pilot_requests, RLS, private.* helpers, join_course()
  seed.sql                  empty on purpose — demo data comes from `pnpm seed`
scripts/refresh-metrics.mts `pnpm metrics`: recompute weekly_metrics for every course
scripts/seed.mts            demo data (institution, users, courses, enrollments, assignments) via the service role
scripts/db-push-hosted.mts  applies pending migrations to the hosted project via the Management API
scripts/sage-eval.mts       S5: runs the 30 trick prompts (sage-trick-prompts.json) and lists replies that give away answers
tests/db/rls.test.ts        RLS tests against local Supabase (skipped when it isn't running)
tests/db/teacher-dashboard.test.ts  teacher RPC scoping and the Reliance Score formula
tests/db/trace-rls.test.ts  S9: RLS for submissions, writing_events, writing_snapshots, integrity_reports
```

Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (vitest, `src/**/*.test.ts`, `tests/**/*.test.ts`), `seed`, `metrics`, `sage:eval`, `db:start`, `db:reset`, `db:types` (regenerate `database.types.ts` from local), `db:push:hosted`.

## Routes (planned)

- `/` landing, `/about`, `/privacy`, `/login`, `/signup`
- `/student/*` student app (home, `sage/[assignmentId]`, assignment, Trace editor, my learning)
- `/teacher/*` teacher app (overview, courses, students, student detail, flags, replay, Lens)
- `/api/*` server routes; every model call lives here
- Login redirects by role: student → `/student`, teacher → `/teacher`

## Non-negotiable rules

**Security**
- API keys only in server-side env vars. The browser never calls the model. No `NEXT_PUBLIC_` prefix on secrets.
- Row-level security on every Supabase table. Keep the test proving a student cannot read another student's messages.
- Lens tools are read-only and scoped to the teacher's own courses. No agent writes raw SQL.
- Rate limit Sage at ~60 messages per student per hour.
- Commit `.env.example`, never `.env*` with real values.

**Product voice**
- Never use the words "cheating", "cheater", "catch", "spy" or "AI-generated" anywhere in UI, prompts or copy. Trace reports evidence; teachers decide.
- Encouraging and plain: "Let's work through this together", not "Request denied".
- Students can see all of their own data. Teachers see summaries by default.
- Student data is never used to train models.
- Demo and seed data use invented Indian names only (e.g. Riya Sharma, Arjun Mehta, Sneha Iyer).
- Never invent statistics on the marketing site. Survey numbers stay as `[XX]%` placeholders until real results exist.

**Design**
- Use the exact tokens in `design/tokens.json` (also PLAN.md §5). Light and dark mode from day one, following system setting.
- Instrument Serif for large headlines only; Geist for UI and body (16px / 1.6); Geist Mono for numbers and code.
- 8px grid, 12 columns, 1200px max content width, 16px card radius, 1px borders instead of heavy shadows.
- Amber accent only for the single most important highlight on a screen.
- Lucide icons at 1.5px stroke. No eye icons, padlocks, robots or purple-blue gradients.
- Motion: 150–600ms, ease-out, animate only opacity/position/scale, respect `prefers-reduced-motion`.
- Mobile-first: Sage chat and Trace editor must work at 375px.
- Touch targets ≥ 44px, visible focus states, WCAG AA contrast in both themes.
- No lorem ipsum. Designed empty states and loading skeletons.

## How each session works

1. Read `CLAUDE.md` and `PLAN.md`.
2. Do one session from `SESSIONS.md` (one feature per session). Work on a branch `s<N>-<slug>`, open a PR into `main`.
3. Run `pnpm lint`, `pnpm typecheck` and tests before finishing.
4. Tick the session in `SESSIONS.md`, then update **Status** and **Handoff notes** below.

## Status

- [x] Day 0: repo created with plan, design reference and this file (2026-10-16)
- [x] S1 scaffold (2026-10-16): Next.js 16 + Tailwind v4 + shadcn/ui, Supabase email/password login with student/teacher/admin roles, role redirects, demo users, lint/typecheck/test scripts
- [x] S2 design system (2026-10-16): tokens as CSS variables with light/dark, Instrument Serif + Geist + Geist Mono, restyled shadcn components, app shell for both apps, /design page
- [x] S3 database (2026-10-16): 15 tables with RLS (PLAN.md §8 + pilot_requests), RLS tests, seed (1 institution, 1 teacher, 2 courses, 5 assignments, 30 students); applied and seeded on the hosted project
- [x] S4 Sage chat (2026-10-16): /student/sage/[assignmentId], streaming via AI SDK v7 + OpenAI-compatible provider, Markdown/KaTeX/code, hint ladder + modes in the system prompt, mode badge + hint-level indicator, every message saved
- [x] S5 labels and flags (2026-10-16): classify_message (JSON output + keyword safety net) saves intent/topic/attempted per student message and hint_level per reply; flag_to_teacher rules; 60/hour rate limit; 30 trick prompts + `pnpm sage:eval`
- [x] S6 notes search (2026-10-16): teacher PDF upload to Storage, unpdf extraction, ~500-token page chunks, pgvector + keyword hybrid search, `search_course_material` tool, page chips under replies. Also: teacher notes are now teacher-only
- [x] S7 teacher dashboard + S8 Lens (2026-10-16): overview, courses/assignments (AI mode picker, join code), students table, student detail, flags, flagged-chat view; weekly_metrics + Reliance Score in SQL; Lens page + overview box with 7 read-only tools, charts/tables from tool results, Draft email and Make quiz. Migration applied on hosted.
- [ ] **Not yet verified against a real model**: no AI_* env vars in the cloud env. Sage and Lens were tested end to end with local mock providers. Once keys are set, run `pnpm sage:eval`, try the demo flow and the Lens demo question
- [x] S9 Trace (2026-10-16): Tiptap editor with 5s autosave/event batches, paste mark, `writing_snapshots` migration (applied on hosted), submit, teacher replay with scrubber and amber pastes, Trace agent (structured JSON, template fallback)
- [x] S10 landing (2026-10-16): landing page from design/landing (all 11 sections + animations), /about, /privacy, rebuilt /login and /signup (magic link, role cards, institution, class code), pilot form → `pilot_requests` via `/api/pilot`
- [ ] S11 demo data — **next**

## Handoff notes

- **S10 (landing) shipped** from branch `claude/eager-planck-pk12ip`. Decisions made without asking:
  - **Styles.** `design/landing/site.css` was ported almost verbatim to `components/marketing/site.css` instead of rewriting ~1000 lines into Tailwind utilities, so the site matches the prototype exactly. Every rule is nested under `.ss` (the wrapper rendered by the `(marketing)` and `(auth)` layouts) because Next keeps route stylesheets loaded after navigation; nothing leaks into the apps. Colours map onto the `--ss-*` tokens; the site's amber is `--insight` (not `--accent`, which shadcn uses). Site-only values (`--nav-bg`, `--shadow-window`, pilot panel greens) have their own light/dark blocks in the same two-block pattern as globals.css. Fonts come from the `next/font` variables. Selector bugs from the prototype were fixed (FAQ plus icon stretched, lab/callout/alert/member icons overridden by `span` rules, Lens send arrow invisible, hover lift lost after reveal).
  - **Theme switch.** The site and auth pages keep the prototype's moon/sun button. It sets `<html data-theme>` and stores the choice in `localStorage` (`ss-site-theme`); `SiteThemeScope` removes the attribute when leaving for the apps, which always follow the system.
  - **Motion.** Entrance animations (hero words 60ms apart, pills, chat pop) are the prototype's CSS keyframes; scroll reveals use Motion `useInView` (`<Section>` sets `data-in`, CSS fades `.rv`/`.rc`); How-it-works line and dashboard tilt use `useScroll`; count-ups and the Trace replay use `animate()`. The hero chat typing/streaming uses timers (it is a script, not a tween). Everything shows its final state under `prefers-reduced-motion`.
  - **Survey stats** live in `components/marketing/survey.ts` as `null` → `[XX]%` / `[N]`. Put real numbers there; they count up automatically.
  - **Pilot form.** Roles map Professor → `teacher`, HOD → `hod`, Dean → `admin`, Other → `other` (existing `pilot_role` enum), so **no migration was needed**. The route validates with the same zod schema as the client, has a hidden honeypot field (`website`) and a best-effort in-memory limit of 5 requests / 10 min per IP. Verified end to end on hosted (test row inserted, then deleted; anon cannot read the table).
  - **Auth.** Login has "Email me a sign-in link" and "Forgot password?", both `sendMagicLink` (`signInWithOtp`, `shouldCreateUser: false`). It always shows "Check your inbox" (except on rate limit) so it never reveals who has an account. Sign-up: teachers must give an institution (stored as user metadata `institution_name`, since `profiles.institution_id` needs an institution flow); students may give a 6-character class code (metadata `join_code`), joined via `rpc('join_course')` right after sign-up if a session exists, else in `/auth/confirm`, then cleared. A wrong code is ignored silently; the student adds it later. The magic link only works once Supabase Auth's redirect allow list includes `/auth/confirm` on each domain (see the hosted note below).
  - **Copy changes from the prototype.** Nav "Log in" → `/login`; footer Privacy/About → the new pages. Sign-up legal line links only the privacy policy (there is no Terms page yet). Class-code placeholder `THRM01` (real codes are 6 chars; the prototype's `ME204-7KQ` would fail).
  - **/about and /privacy** had no artboards; they reuse the site parts (page head, `.prose`, cards, `.cta-band`). The team list is `components/marketing/team.ts`, currently only "Naresh Meena — Founder": **check the role and add teammates**. The privacy page only states what PLAN.md §9 promises (180-day deletion, no training, summaries by default, RLS). **There is no contact email yet**, so "Write to us" links to the pilot form; add an address when one exists.
  - Screens checked at 1440 and 390, light and dark, with Playwright (pilot validation, mobile menu, FAQ, compare toggle, login/sign-up validation, wrong-password message).

- **S7 + S8 (teacher dashboard, Lens)** shipped together from `claude/compassionate-darwin-j3i3hi`. Decisions:
  - **Data access.** `lib/teacher/queries.ts` is the one read layer for the pages and Lens tools. Every function takes the teacher's own Supabase client (RLS) *and* filters by `courseScope()` (the teacher's courses, or null for a course that isn't theirs → 404/"not found"). Teachers can't read message rows, so per-student and per-topic counts come from SECURITY DEFINER RPCs in migration `20261020070000_teacher_dashboard.sql`: `teacher_student_activity(course?, from?, to?)` and `teacher_topic_struggles(course?, student?, from?, to?, limit?)`. Both return numbers/labels only and only for `private.my_courses()`. Tested in `tests/db/teacher-dashboard.test.ts`.
  - **Reliance Score** is computed in SQL by `refresh_weekly_metrics(course?, weeks=8)`: weeks start Monday **India time**; *a* = answer_seeking share of student messages; *p* = mean `integrity_reports.paste_ratio` of work submitted that week; *e* = share of assignments used that week where a message with `hint_level ≥ 4` came before any attempt (`attempted = true` or `intent = concept_question`; unlabelled messages count as attempts). **A part with no data is dropped and the other weights rescaled** (a student who only chats is scored on 0.5a+0.2e over 0.7), so missing Trace data doesn't cap the score. Teachers may refresh their own courses ("Update numbers" on the overview); the service role refreshes all (`pnpm metrics`, and the nightly Vercel cron at 02:00 IST → `/api/cron/weekly-metrics`, needs `CRON_SECRET` in Vercel). The weekly row is deleted and rewritten for the window, so re-running is safe. **S11: run `pnpm metrics --weeks 6` after generating demo activity.** Student messages need `topic` set (S5 does) for "struggling topics" to show.
  - **Overview numbers**: active students / conversations / messages = last 7 days, live from messages; average Reliance = the latest week with metrics; open flags (amber marker, the one highlight). Students table: last 30 days + latest weekly score (averaged across the student's courses when "All courses").
  - **Chat privacy**: `/teacher/conversations/[id]` shows text only when RLS allows it (flagged in the teacher's course, or shared); otherwise a "This chat is private" state. Flag cards link there via the flagged message's conversation.
  - **Teacher notes** are written to `assignment_teacher_notes` (S4–S6's teacher-only table), not `assignments`. S7 was built in parallel with S4–S6, so `20261020070000_teacher_dashboard.sql` **repeats S4–S6's DDL for message labels (`topic`, `attempted`, `citations` + the student insert policy) and the notes table inside guarded blocks**. Now that `20261018040000_sage_notes_search` is on main (and runs first by timestamp), those blocks are no-ops everywhere; they stay so the migration history doesn't change.
  - **Lens** (`/api/lens`): teachers/admins only, zod body `{messages, courseId?}`, `safeValidateUIMessages` against the tools, `streamText` with `isStepCount(6)`, temperature 0.3. Model from `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` (`AI_FALLBACK_MODEL` when `DEMO_MODE=true`) via `lib/lens/model.ts`; without them it answers 503 with a friendly sentence. S4's `lib/ai/provider.ts` does the same job — fold Lens onto it in S12. Tools: the 7 from PLAN.md §4, all read-only. `draft_message` and `generate_quiz` have the model put the email/quiz into the tool **input**; the tool validates it (quiz = exactly 5 × 4 options) and the UI renders a card with Copy / "Open in email app" / Show answers. Nothing is sent or saved. Charts and tables are drawn by the client from **tool outputs** (`components/lens/tool-views.tsx`), never from model text, so numbers can't be invented. Lens chats aren't stored (reload = fresh). Rate limit: 40 requests per 10 min per teacher, in memory (per instance).
  - **Tested end to end** with a mock OpenAI-compatible server (tool calls → charts → markdown table → Make quiz). No real model key exists in this cloud env, so the prompt is untested against a real model — try the demo question from PLAN.md §12 once a key is set.
  - **Dynamic routes** (`courses/[courseId]`, `students/[studentId]`, `conversations/[conversationId]`) set `export const instant = false`, the same workaround S4/S9 used for the shell's `usePathname()` outside Suspense.
  - **Node 22+**: AI SDK 7 needs it; `engines.node` is now `>=22` (Vercel's default is fine).
  - Not added to /design (left alone: other sessions own it): the teacher charts, TopicList, FlagList, LensBox.
  - Not done: course delete, removing students from a roster, Lens chat history, a students-table CSV export. `/teacher/materials` (S6) is linked from the course page ("Notes and PDFs") but isn't in the sidebar.

- **S2 and S3 shipped together** in one PR from branch `claude/jolly-mayer-zxechp` (the cloud session's assigned branch), one commit per session.
- **Auth and roles.** `public.profiles` (migration `20261016000000_profiles.sql`) holds `role` (`user_role` enum) and `full_name`; a trigger creates it on sign-up. Sign-up may request `student` or `teacher` only; anything else becomes `student`. No insert/update policies on profiles, so roles change only through the service role. Users read their own profile; teachers read their enrolled students'; students read their teachers'. `institution_id` → `institutions` (set by the seed; sign-up leaves it null until an institution flow exists).
- **Routing.** Login → `redirectAfterLogin(role, next)`: students `/student`, teachers and admins `/teacher`. The proxy only does an optimistic signed-in check; every protected page must call `requireRole([...])` itself (it also bounces the wrong role to its own home). Do the same in every API route.
- **Cache Components is on** (Next 16 default here). Anything that reads cookies/session (`requireRole`, `getCurrentUser`) must render inside a `<Suspense>` boundary — see `app/student/page.tsx` for the pattern. Next keeps the previous route mounted but hidden (`<Activity>`), so in browser tests select `h1:visible`, not `h1`.
- **Env.** The cloud environment already sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` for the **hosted** project; real process env beats `.env.local`. To work against local Supabase in a cloud session, start Docker (`dockerd &`), run `pnpm db:start`, then `set -a; . ./.env.local; set +a` with the local keys before `pnpm build`/`pnpm start`. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after switching.
- **Hosted Supabase is migrated and seeded (S3).** Both migrations are recorded in `supabase_migrations.schema_migrations` (the S1 one was applied by hand earlier and recorded as a baseline). For new migrations run `pnpm db:push:hosted` (uses `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`, set in the cloud env; `--dry-run` lists pending), then `pnpm seed` if seed data changed. Still to do by hand: in Supabase Auth settings, set the Site URL and add the Vercel domains (`https://*.vercel.app/**`) to the redirect allow list.
- **Demo accounts.** `teacher@demo.safesight.in` (Kavita Sharma), `riya@demo.safesight.in` (Riya Sharma), `admin@demo.safesight.in` (Arjun Mehta). Locally the password is `safesight-demo`. On hosted they keep the password they already had — `pnpm seed` never changes an existing user's password unless run with `--reset-passwords` and `SEED_PASSWORD`. The other 29 seeded students (`firstname.lastname@demo.safesight.in`) were created on hosted with random passwords: they fill rosters but can't log in.
- **Seed data (S3).** Institution "Shivalik Institute of Technology", Mandi (invented). Kavita Sharma teaches ME201 Thermodynamics (join code `THRM01`, all 30 students) and ME204 Fluid Mechanics (`FLMC02`, first 20). Five assignments covering all three modes, incl. "Thermodynamics problem set 3" (Learn) for the demo. Fixed UUIDs (`00000000-0000-4000-8000-…`) keep it idempotent; S11 adds activity on top. The account `nareshmeena1202@gmail.com` on hosted is a real sign-up and is left alone.
- **Schema decisions (S3).** Enums: `ai_mode`, `message_role` (`user`/`assistant`, matching the AI SDK), `message_intent` (the five `classify_message` labels), `writing_event_type`, `flag_type` (`answer_seeking`, `exam_mode_attempt`, `instruction_override`, `wellbeing`), `flag_severity`, `flag_status`, `pilot_role`. `material_chunks.embedding` is `vector(1024)` (BAAI/bge-m3); another embedding size needs a migration. `courses.join_code` defaults to 6 random uppercase chars. Added beyond §8: `conversations.shared_with_teacher`, `flags.reason` / `resolved_at`, `submissions.created_at` / `updated_at` (unique per assignment + student), `pilot_requests.message`. `weekly_metrics.week` is the Monday of the ISO week.
- **RLS model (S3).** Policies call SECURITY DEFINER helpers in the `private` schema (`is_course_teacher`, `is_enrolled`, `teaches_student`, `owns_conversation`, `teacher_can_read_conversation`, …) to avoid recursion. Students: own rows only; may insert `messages` only with `role='user'` and no labels; may only toggle `shared_with_teacher` on conversations; edit submissions only while `submitted_at` is null. Teachers: their courses, rosters, assignments, materials, conversation metadata, submissions, events, reports, metrics, flags (column grant: only `status`, `resolved_at` updatable). **Message text** is visible to a teacher only if a flag in their course points at a message in that conversation, or the student shared it. Students see their own flags except `wellbeing`. Labels, assistant replies, flags, reports, metrics, chunks and `pilot_requests` are written with the service role only (`lib/supabase/admin.ts`). Teacher notes live in `assignment_teacher_notes` (teacher-only; see S4–S6 notes below). Admins get nothing extra until v2. Students join via `rpc('join_course', { p_join_code })`.
- **RLS tests** (`tests/db/rls.test.ts`) create throwaway users on **local** Supabase only (keys from `supabase status`, or `SUPABASE_TEST_*`) and skip with a warning when it isn't running — start Docker and `pnpm db:start` before `pnpm test` to run them. Add a case whenever a policy changes.
- **Typed clients.** `createClient()` (server/browser/admin) is typed with `Database`. After a migration: `pnpm db:reset` locally, then `pnpm db:types`.
- **Design tokens (S2).** `globals.css` defines every token in `design/tokens.json` as `--ss-*` variables, light by default, dark under `prefers-color-scheme` *or* `<html data-theme="dark">` (`data-theme="light"` forces light; only /design uses the override). The dark block is written twice (system + forced) — change both. shadcn's variables are mapped onto the brand, so `bg-primary`, `bg-card`, `text-muted-foreground` etc. all work. Extra utilities: `bg-surface`, `text-text-muted`, `bg-primary-soft`, `bg-primary-hover`, `border-border-strong`, `bg-hover` (neutral hover tint), `bg-good|warning|critical`, `shadow-lift`, `ease-out` (brand curve). Derived values not in tokens.json (`border-strong`, `primary-hover`, `muted`, `hover`, `glow`) come from `design/landing/site.css`.
- **Amber is `insight`, not `accent`.** shadcn uses `accent` for menu/hover fills (mapped to primary-soft), so the brand's Insight amber is `bg-insight` / `text-on-insight` / `bg-insight-soft`, plus `Button variant="insight"` and `Badge variant="insight"`. Once per screen.
- **Type scale** as Tailwind text utilities: `text-display`, `text-headline`, `text-headline-sm` (pair with `font-serif`), `text-lead`, `text-title`, `text-body`, `text-label`, `text-small`, `text-eyebrow`, `font-mono text-mono`, `font-mono text-mono-stat`. Display/headline/lead switch to desktop sizes at `md`. Fonts via `next/font/google` in `app/layout.tsx` (`--font-geist`, `--font-geist-mono`, `--font-instrument-serif`). Page titles use `font-serif text-headline-sm`.
- **Radius**: `rounded-sm` 8, `rounded-md` 12 (controls), `rounded-lg` 16 (cards), `rounded-xl` 24, `rounded-full`. **Focus**: one global `:focus-visible` box-shadow (the `focus-ring` token); shadcn's `ring-ring/50` classes were stripped — strip them from newly added shadcn components too, swap `ring-1 ring-foreground/10` for `border`, and use `rounded-md` for controls. Buttons/inputs/selects are 44px tall by default (`size="sm"` is 36px — desktop-only spots).
- **App shell.** `AppShell area="student|teacher"` (used by both layouts): sidebar from `lg`, sheet menu below, top bar with the account menu (inside Suspense), 1200px content column, skip link. Nav items live in `components/app/nav.ts`; items with `soon: "S7"` render disabled with a "Soon" pill — remove `soon` when the page lands. Start each page with `<PageHeader eyebrow title description actions />` and use `<PageSkeleton />` as the Suspense fallback.
- **Product components** ready for S4+: `ModeBadge` (learn/assist/exam), `RelianceBadge` (score → band dot + label; thresholds in `lib/reliance.ts` are a first guess), `StatCard` (`highlight` = amber dot), `EmptyState`, `FadeUp`. `TooltipProvider` wraps the app in the root layout.
- **/design** is public and `noindex`. Add every new shared component to it. Auth pages got the tokens but are still placeholders; S10 rebuilds them from `design/landing/Auth.dc.html` (magic link, password toggle, institution field).
- **Screenshots in a cloud session**: `pnpm build && pnpm start`, then Playwright with `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"` and `colorScheme: "dark"` for dark mode.
- The landing-page design was finished in Claude Design. `design/landing/` holds the prototype source (`.dc.html` artboards plus `site.css`). Treat it as the visual spec for S10: copy, layout, spacing, animations and mobile layouts. Rebuild it in Next.js + Tailwind + Motion; do not ship the prototype files.
- The prototype's `.dc.html` files use a Claude Design runtime (`<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`, a `class Component extends DCLogic` script). Read them for structure and behaviour, not as React code.
- `design/tokens.json` is the design-system export (colour, type, spacing, radius, shadow tokens with usage notes).
- **S4–S6 shipped together** from branch `claude/wonderful-meitner-pti3jr`, migration `20261018040000_sage_notes_search.sql` (applied to hosted with `pnpm db:push:hosted`; nothing to re-seed).
- **Teacher notes are teacher-only (breaking).** `assignments.teacher_notes` was **dropped**; notes moved to `public.assignment_teacher_notes (assignment_id pk, notes, updated_at)` with one RLS policy: the course teacher manages them. Students have no policy. Sage reads them with the service role (`getAssignmentPolicy` in `lib/sage/data.ts`) and the prompt tells it never to quote them. S7's assignment form should upsert into this table, not `assignments`. The seed writes there too.
- **AI provider.** `lib/ai/provider.ts` (server-only): `chatModel()`, `embeddingModel()` (null if unset), `aiStatus()`. Env: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (required for Sage), `EMBEDDING_MODEL` (+ optional `EMBEDDING_BASE_URL`/`EMBEDDING_API_KEY`), `AI_STRUCTURED_OUTPUTS`, `AI_FALLBACK_MODEL` (used only when `DEMO_MODE=true`; S12 adds slow-model fallback), `SAGE_RATE_LIMIT_PER_HOUR`, `SAGE_COUNSELLING_CONTACT`. Without chat env the Sage page shows "being set up" and the API returns 503; Exam mode still works (no model call). The SDK is **AI SDK v7** — read `node_modules/ai/docs/` (APIs differ from v4/v5: `toUIMessageStream({ stream: result.stream })`, `isStepCount`, `onEnd`, `Output.object`).
- **Sage turn** (`app/api/sage/route.ts`): student only → zod body `{assignmentId, conversationId|null, message:{id,text}}` (the client sends only the new message; the server loads history, last 40) → assignment read under RLS (proves enrollment) → rate limit (user messages in the last hour across the student's conversations) → conversation resolved/created → user message logged → `classifyMessage` (8s timeout; falls back to heuristics) → `nextHintLevel` → `decideFlags` → labels + flags written → `streamText` with `search_course_material` (only if the course has ready materials), `isStepCount(3)` → reply saved in `onEnd` (kept alive with `after()`), id = UI message id. Errors are plain-text bodies that `useChat` shows verbatim, so keep them friendly. PLAN.md's other Sage "tools" (`get_assignment_policy`, `get_student_progress`, `classify_message`, `log_interaction`, `flag_to_teacher`) run as deterministic functions in `lib/sage/data.ts` rather than model-called tools, so the model can't skip them.
- **Labels.** User messages get `intent`, `topic` (≤6 words, for S7/S8 "topics struggling"), `attempted`. Assistant messages get `hint_level` and `citations` (`[{materialId,title,page}]`). The keyword heuristic (`lib/sage/labels.ts`) can only *raise* distress / override / explicit answer-seeking over the model's labels. Students can't write any label column (RLS insert check, tested).
- **Hint ladder rules** (`lib/sage/ladder.ts`, tested): one step per turn; without an attempt Learn caps at 3 (Guide), Assist at 4; a real attempt climbs (first message with work starts at 2); a shared full attempt → 5; concept questions ≥2; Exam/distress → null. The demo (paste, insist, insist) gives 1 → 2 → 3. Reliance's *e* ("step 4 without an attempt") can only happen in Assist.
- **Flag rules** (`lib/sage/flags.ts`, tested): answer_seeking when ≥3 of the last 10 student messages are answer-seeking/pasted (low; medium at 5); exam_mode_attempt on any Exam-mode message (medium); instruction_override (low; medium on the 2nd in a chat); wellbeing (high for high distress, else medium; the reply shows a care card with the counselling contact and Tele-MANAS 14416). De-duplicated by type+severity against open flags for the same student+course in the last 24h. Flags point at the user message, which (by S3 RLS) lets the teacher read that chat.
- **Notes search (S6).** Private bucket `course-materials`, objects at `<course_id>/<uuid>.pdf`; Storage RLS: course teacher uploads/deletes, teacher + enrolled students read. The browser uploads directly (avoids Vercel's 4.5 MB body limit), then `POST /api/materials` inserts the row (RLS proves the teacher) and runs `ingestMaterial` (unpdf per page → `chunkPages` ≈2,000 chars, never crossing a page → `embedMany` in batches of 32 → `material_chunks`). `materials.status` is processing/ready/failed with a friendly `error`. `public.match_material_chunks(course, query, embedding?, k)` fuses vector and keyword (generated `fts` column) ranks; with no `EMBEDDING_MODEL` it is keyword-only, and "Read again" on /teacher/materials adds vectors later. Embeddings must be 1024-dim. Ingest runs inside the request (`maxDuration = 60`): very large PDFs may need a background job later. Scanned PDFs without a text layer fail with an OCR message.
- **Citation chips** link to `/api/materials/<id>/file?page=N`, which checks access under RLS and redirects to a 60-second signed URL with `#page=N`.
- **App shell + dynamic routes.** `NavLinks` calls `usePathname()` outside `<Suspense>`, which fails the build for any route with an unknown dynamic param. `/student/sage/[assignmentId]` sets `export const instant = false` to work around it; S7/S9 dynamic routes will need the same, or whoever owns the shell can wrap `NavLinks` in Suspense and drop these opt-outs.
- **Not done / for later sessions.** /teacher/materials isn't in the sidebar (nav.ts left alone because other sessions edit it) — S7 should link it from the courses page or add a nav item (S7 links it from each course page as "Notes and PDFs"). No "share this chat with my teacher" toggle yet (column exists). No output check before streaming a reply (PLAN.md risk table); `pnpm sage:eval` is the pre-demo check instead. Sage replies in English only (Hinglish is v2).
- **Local end-to-end testing without keys.** A tiny mock OpenAI-compatible server (chat streaming with tool calls, json_object labels, 1024-dim embeddings) is enough to drive the whole flow; point `AI_BASE_URL` at it in `.env.local`, rebuild, and use Playwright. That's how S4–S6 were verified.
- **Trace (S9).** Routes: student `/student/trace` (list) → `/student/trace/[assignmentId]` (editor; after submit, the same page shows the student their own summary and replay); teacher `/teacher/submissions` → `/teacher/submissions/[submissionId]`. **No nav entries were added** (app shell was off-limits during parallel work): add "Writing" (`/student/trace`, icon `NotebookPen`) and "Submissions" (`/teacher/submissions`) to `components/app/nav.ts`, and point an assignment page's "Write in Trace" button at `/student/trace/<assignmentId>`.
- **Trace recording.** The editor records every transaction: inserted text → `type`, or `paste` when ProseMirror's `uiEvent` is paste/drop; removed text → `delete`; editor focus/blur. Sizes count **visible (non-whitespace) characters** everywhere. Keystrokes within 1s are merged (`coalesceEvents`). Every 5s the editor POSTs `{events, content?, charCount?}` to `/api/trace/[id]/batch` (user client, RLS: own draft only); `sendBeacon` on pagehide/hidden. Client timestamps are clamped to [now − 12h, now]. The first visit to the editor creates the draft row.
- **Paste mark.** Pasted/dropped text gets a Tiptap mark rendered as `<span data-trace-paste>` (invisible to the student; `.trace-show-pastes` tints it amber). `paste_ratio` = visible chars inside the mark ÷ visible chars in the final HTML (`measureHtml`, a DOM-free scanner), so text pasted then deleted or retyped doesn't count. Per-paste share in the summary is paste size ÷ final length ("about").
- **Replay data.** New table `writing_snapshots` (migration `20261019090000_trace_snapshots.sql`, same RLS as `writing_events`, insert-only while draft): each batch that changed the document stores its HTML, dated at the batch's last event. The replay shows the latest snapshot at the scrubber time; pauses > 4s are squeezed to 4s (`buildReplayClock`); new sessions (gap > 30 min) get a thin tick, pastes an amber tick and a "Jump" row. Snapshot HTML is only ever rendered through a read-only Tiptap editor (schema drops unknown tags). Storage grows with long essays (full HTML every 5s while typing); S12/v2 could thin old snapshots.
- **Trace agent.** `lib/trace/report.ts`: `computeMetrics` (active time = gaps ≤ 5 min; session break = gap > 30 min) → `writeSummary` asks `AI_MODEL` for `{summary}` via `generateText` + `Output.object` (temp 0.2, 20s timeout) and falls back to `templateSummary` when no model env is set, the call fails, or the text trips `usesBannedWords`. Times are IST. Runs with the service role in `after()` on submit; a teacher can re-run it from the replay page ("Prepare/Refresh summary"). **The cloud env has no `AI_*` vars yet**, so summaries currently come from the template. `lib/trace/model.ts` builds its own OpenAI-compatible model from the same env vars; it could switch to `chatModel()` from `lib/ai/provider.ts` (S4) later.
- **Known framework issues (not Trace).** The app shell's `NavLinks` calls `usePathname()` outside `<Suspense>`, which fails the build for any dynamic route; the two Trace `[param]` pages set `export const instant = false` to render on request. The cleaner fix (S12 or whoever next touches the shell) is to wrap `NavLinks` in Suspense, then drop those exports — `/student/sage/[assignmentId]` (S4) does the same. `next start` also logs "unstable value `Date.now()` while prerendering" on `/teacher` and `/student` — it happens on untouched pages too (auth/shell), so look at it in S12.
- **New deps (S9):** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/core`, `ai` (v7), `@ai-sdk/openai-compatible`. `ai` and `@ai-sdk/openai-compatible` are shared with S4 (same versions).
