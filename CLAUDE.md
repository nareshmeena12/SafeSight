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
    student/                student app (layout = AppShell + home)
    teacher/                teacher app (layout = AppShell + overview); admins land here too until v2
  components/
    ui/                     shadcn/ui (radix "nova" preset), restyled to our tokens. Add more with `pnpm dlx shadcn@latest add <name>`, then restyle (see Handoff)
    auth/                   login (password + magic link) and sign-up forms (client, useActionState); field.tsx also keeps the app-style Field used on /design
    marketing/              S10: site.css (all site styles, nested under .ss), site-header, site-footer, site-theme (light/dark switch), cta-band, survey.ts (stat placeholders), team.ts, landing/* (one file per section)
    app/                    app-shell (sidebar + top bar), nav.ts (nav config per app), nav-links, mobile-nav (sheet), user-menu, page-header, page-skeleton
    product/                mode-badge, reliance-badge, stat-card, empty-state
    motion/fade-up.tsx      Motion fade-up (respects reduced motion)
    logo.tsx                Logo (mark + wordmark) and LogoMark
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
supabase/
  config.toml               local Supabase (CLI is a devDependency)
  migrations/               SQL migrations, applied in order
  migrations/…_core_schema   S3: all PLAN.md §8 tables + pilot_requests, RLS, private.* helpers, join_course()
  seed.sql                  empty on purpose — demo data comes from `pnpm seed`
scripts/seed.mts            demo data (institution, users, courses, enrollments, assignments) via the service role
scripts/db-push-hosted.mts  applies pending migrations to the hosted project via the Management API
tests/db/rls.test.ts        RLS tests against local Supabase (skipped when it isn't running)
```

Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (vitest, `src/**/*.test.ts`, `tests/**/*.test.ts`), `seed`, `db:start`, `db:reset`, `db:types` (regenerate `database.types.ts` from local), `db:push:hosted`.

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
- [x] S10 landing (2026-10-16): landing page from design/landing (all 11 sections + animations), /about, /privacy, rebuilt /login and /signup (magic link, role cards, institution, class code), pilot form → `pilot_requests` via `/api/pilot`
- [ ] S4 Sage chat — **next** (S4–S9 run in parallel sessions)

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

- **S2 and S3 shipped together** in one PR from branch `claude/jolly-mayer-zxechp` (the cloud session's assigned branch), one commit per session.
- **Auth and roles.** `public.profiles` (migration `20261016000000_profiles.sql`) holds `role` (`user_role` enum) and `full_name`; a trigger creates it on sign-up. Sign-up may request `student` or `teacher` only; anything else becomes `student`. No insert/update policies on profiles, so roles change only through the service role. Users read their own profile; teachers read their enrolled students'; students read their teachers'. `institution_id` → `institutions` (set by the seed; sign-up leaves it null until an institution flow exists).
- **Routing.** Login → `redirectAfterLogin(role, next)`: students `/student`, teachers and admins `/teacher`. The proxy only does an optimistic signed-in check; every protected page must call `requireRole([...])` itself (it also bounces the wrong role to its own home). Do the same in every API route.
- **Cache Components is on** (Next 16 default here). Anything that reads cookies/session (`requireRole`, `getCurrentUser`) must render inside a `<Suspense>` boundary — see `app/student/page.tsx` for the pattern. Next keeps the previous route mounted but hidden (`<Activity>`), so in browser tests select `h1:visible`, not `h1`.
- **Env.** The cloud environment already sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` for the **hosted** project; real process env beats `.env.local`. To work against local Supabase in a cloud session, start Docker (`dockerd &`), run `pnpm db:start`, then `set -a; . ./.env.local; set +a` with the local keys before `pnpm build`/`pnpm start`. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after switching.
- **Hosted Supabase is migrated and seeded (S3).** Both migrations are recorded in `supabase_migrations.schema_migrations` (the S1 one was applied by hand earlier and recorded as a baseline). For new migrations run `pnpm db:push:hosted` (uses `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`, set in the cloud env; `--dry-run` lists pending), then `pnpm seed` if seed data changed. Still to do by hand: in Supabase Auth settings, set the Site URL and add the Vercel domains (`https://*.vercel.app/**`) to the redirect allow list.
- **Demo accounts.** `teacher@demo.safesight.in` (Kavita Sharma), `riya@demo.safesight.in` (Riya Sharma), `admin@demo.safesight.in` (Arjun Mehta). Locally the password is `safesight-demo`. On hosted they keep the password they already had — `pnpm seed` never changes an existing user's password unless run with `--reset-passwords` and `SEED_PASSWORD`. The other 29 seeded students (`firstname.lastname@demo.safesight.in`) were created on hosted with random passwords: they fill rosters but can't log in.
- **Seed data (S3).** Institution "Shivalik Institute of Technology", Mandi (invented). Kavita Sharma teaches ME201 Thermodynamics (join code `THRM01`, all 30 students) and ME204 Fluid Mechanics (`FLMC02`, first 20). Five assignments covering all three modes, incl. "Thermodynamics problem set 3" (Learn) for the demo. Fixed UUIDs (`00000000-0000-4000-8000-…`) keep it idempotent; S11 adds activity on top. The account `nareshmeena1202@gmail.com` on hosted is a real sign-up and is left alone.
- **Schema decisions (S3).** Enums: `ai_mode`, `message_role` (`user`/`assistant`, matching the AI SDK), `message_intent` (the five `classify_message` labels), `writing_event_type`, `flag_type` (`answer_seeking`, `exam_mode_attempt`, `instruction_override`, `wellbeing`), `flag_severity`, `flag_status`, `pilot_role`. `material_chunks.embedding` is `vector(1024)` (BAAI/bge-m3); another embedding size needs a migration. `courses.join_code` defaults to 6 random uppercase chars. Added beyond §8: `conversations.shared_with_teacher`, `flags.reason` / `resolved_at`, `submissions.created_at` / `updated_at` (unique per assignment + student), `pilot_requests.message`. `weekly_metrics.week` is the Monday of the ISO week.
- **RLS model (S3).** Policies call SECURITY DEFINER helpers in the `private` schema (`is_course_teacher`, `is_enrolled`, `teaches_student`, `owns_conversation`, `teacher_can_read_conversation`, …) to avoid recursion. Students: own rows only; may insert `messages` only with `role='user'` and no labels; may only toggle `shared_with_teacher` on conversations; edit submissions only while `submitted_at` is null. Teachers: their courses, rosters, assignments, materials, conversation metadata, submissions, events, reports, metrics, flags (column grant: only `status`, `resolved_at` updatable). **Message text** is visible to a teacher only if a flag in their course points at a message in that conversation, or the student shared it. Students see their own flags except `wellbeing`. Labels, assistant replies, flags, reports, metrics, chunks and `pilot_requests` are written with the service role only (`lib/supabase/admin.ts`). `assignments.teacher_notes` is readable by enrolled students — never put answer keys there. Admins get nothing extra until v2. Students join via `rpc('join_course', { p_join_code })`.
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
