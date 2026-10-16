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
    globals.css             Tailwind v4 + shadcn variables (dark mode = prefers-color-scheme). S2 swaps in our tokens
    page.tsx                placeholder home; S10 replaces it with the landing page
    (auth)/login, signup    auth pages (route group, shared centred-card layout)
    auth/confirm/route.ts   email-link landing: verifies the token, redirects by role
    student/                student app (layout + home)
    teacher/                teacher app (layout + overview); admins land here too until v2
  components/
    ui/                     shadcn/ui (radix base, "nova" preset). Add more with `pnpm dlx shadcn@latest add <name>`
    auth/                   login and sign-up forms (client, useActionState)
    app/app-header.tsx      placeholder top bar + page skeleton; S2 builds the real shell
    logo.tsx                lens mark + wordmark
  lib/
    env.ts                  zod-checked public env
    supabase/               client.ts (browser), server.ts (RSC/actions/routes), proxy.ts, admin.ts (service role, server-only)
    auth/roles.ts           Role type, homeForRole, canAccess, redirectAfterLogin (pure, unit-tested)
    auth/dal.ts             getCurrentUser(), requireRole([...]) — call at the top of every protected page/route
    auth/actions.ts         login, signup, signOut server actions
    auth/schemas.ts         zod schemas for the auth forms
supabase/
  config.toml               local Supabase (CLI is a devDependency)
  migrations/               SQL migrations, applied in order
  seed.sql                  SQL seed for `supabase db reset` (S3 fills it)
scripts/seed-users.mts      demo login accounts via the Auth admin API
```

Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (vitest, `src/**/*.test.ts`, `tests/**/*.test.ts`), `seed:users`, `db:start`, `db:reset`.

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
- [ ] S2 design system — **next**

## Handoff notes

- **Auth and roles.** `public.profiles` (migration `20261016000000_profiles.sql`) holds `role` (`user_role` enum) and `full_name`; a trigger creates it on sign-up. Sign-up may request `student` or `teacher` only; anything else becomes `student`. Users can only *select* their own profile — no insert/update policies, so roles change only through the service role. `institution_id` exists without a foreign key; S3 adds `institutions` and the FK, and policies that let teachers read their students' profiles.
- **Routing.** Login → `redirectAfterLogin(role, next)`: students `/student`, teachers and admins `/teacher`. The proxy only does an optimistic signed-in check; every protected page must call `requireRole([...])` itself (it also bounces the wrong role to its own home). Do the same in every API route.
- **Cache Components is on** (Next 16 default here). Anything that reads cookies/session (`requireRole`, `getCurrentUser`) must render inside a `<Suspense>` boundary — see `app/student/page.tsx` for the pattern. Next keeps the previous route mounted but hidden (`<Activity>`), so in browser tests select `h1:visible`, not `h1`.
- **Env.** The cloud environment already sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` for the **hosted** project; real process env beats `.env.local`. To work against local Supabase in a cloud session, start Docker (`dockerd &`), run `pnpm db:start`, then `set -a; . ./.env.local; set +a` with the local keys before `pnpm build`/`pnpm start`. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after switching.
- **Hosted Supabase.** `20261016000000_profiles.sql` was applied by hand in the SQL Editor and the demo users seeded (2026-10-16). Future migrations: paste into the SQL Editor, or add `SUPABASE_ACCESS_TOKEN` to the environment secrets so a session can apply them (direct Postgres connections are blocked from cloud sessions). Still to do by hand: in Supabase Auth settings, set the Site URL and add the Vercel domains (`https://*.vercel.app/**`) to the redirect allow list.
- **Demo accounts** (`pnpm seed:users`): `teacher@demo.safesight.in` (Kavita Sharma), `riya@demo.safesight.in` (Riya Sharma), `admin@demo.safesight.in` (Arjun Mehta). Password `safesight-demo` locally; `SEED_PASSWORD` is required for a hosted project. The hosted project was seeded on 2026-10-16 with a short demo password (the seed script allows 6+ characters; the sign-up form still requires 8). **Change the demo password (re-run `SEED_PASSWORD=<strong> pnpm seed:users`) or delete the demo accounts before any real users join.**
- **Styling is shadcn's neutral default** for now (dark mode already follows the system). S2 replaces the variables in `globals.css` with `design/tokens.json`, loads Instrument Serif, and builds the real app shell. Auth pages are functional placeholders; S10 rebuilds them from `design/landing/Auth.dc.html` (magic link, password toggle, institution field).
- The landing-page design was finished in Claude Design. `design/landing/` holds the prototype source (`.dc.html` artboards plus `site.css`). Treat it as the visual spec for S10: copy, layout, spacing, animations and mobile layouts. Rebuild it in Next.js + Tailwind + Motion; do not ship the prototype files.
- The prototype's `.dc.html` files use a Claude Design runtime (`<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`, a `class Component extends DCLogic` script). Read them for structure and behaviour, not as React code.
- `design/tokens.json` is the design-system export (colour, type, spacing, radius, shadow tokens with usage notes).
