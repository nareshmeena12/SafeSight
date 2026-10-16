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
    page.tsx                placeholder home; S10 replaces it with the landing page
    design/                 /design: every token and component, with a System/Light/Dark preview switch
    (auth)/login, signup    auth pages (route group, shared centred-card layout)
    auth/confirm/route.ts   email-link landing: verifies the token, redirects by role
    student/                student app (layout = AppShell + home)
    teacher/                teacher app (layout = AppShell + overview); admins land here too until v2
  components/
    ui/                     shadcn/ui (radix "nova" preset), restyled to our tokens. Add more with `pnpm dlx shadcn@latest add <name>`, then restyle (see Handoff)
    auth/                   login and sign-up forms (client, useActionState)
    app/                    app-shell (sidebar + top bar), nav.ts (nav config per app), nav-links, mobile-nav (sheet), user-menu, page-header, page-skeleton
    product/                mode-badge, reliance-badge, stat-card, empty-state
    motion/fade-up.tsx      Motion fade-up (respects reduced motion)
    logo.tsx                Logo (mark + wordmark) and LogoMark
  lib/
    env.ts                  zod-checked public env
    supabase/               client.ts (browser), server.ts (RSC/actions/routes), proxy.ts, admin.ts (service role, server-only)
    auth/roles.ts           Role type, homeForRole, canAccess, redirectAfterLogin (pure, unit-tested)
    auth/dal.ts             getCurrentUser(), requireRole([...]) — call at the top of every protected page/route
    auth/actions.ts         login, signup, signOut server actions
    auth/schemas.ts         zod schemas for the auth forms
    reliance.ts             Reliance Score bands (low < 40 ≤ medium < 70 ≤ high)
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
- [x] S2 design system (2026-10-16): tokens as CSS variables with light/dark, Instrument Serif + Geist + Geist Mono, restyled shadcn components, app shell for both apps, /design page
- [ ] S3 database — **next**

## Handoff notes

- **Auth and roles.** `public.profiles` (migration `20261016000000_profiles.sql`) holds `role` (`user_role` enum) and `full_name`; a trigger creates it on sign-up. Sign-up may request `student` or `teacher` only; anything else becomes `student`. Users can only *select* their own profile — no insert/update policies, so roles change only through the service role. `institution_id` exists without a foreign key; S3 adds `institutions` and the FK, and policies that let teachers read their students' profiles.
- **Routing.** Login → `redirectAfterLogin(role, next)`: students `/student`, teachers and admins `/teacher`. The proxy only does an optimistic signed-in check; every protected page must call `requireRole([...])` itself (it also bounces the wrong role to its own home). Do the same in every API route.
- **Cache Components is on** (Next 16 default here). Anything that reads cookies/session (`requireRole`, `getCurrentUser`) must render inside a `<Suspense>` boundary — see `app/student/page.tsx` for the pattern. Next keeps the previous route mounted but hidden (`<Activity>`), so in browser tests select `h1:visible`, not `h1`.
- **Env.** The cloud environment already sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` for the **hosted** project; real process env beats `.env.local`. To work against local Supabase in a cloud session, start Docker (`dockerd &`), run `pnpm db:start`, then `set -a; . ./.env.local; set +a` with the local keys before `pnpm build`/`pnpm start`. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after switching.
- **Hosted Supabase has not been migrated.** S1 was verified end-to-end against local Supabase only. Before the Vercel preview can log anyone in: apply `supabase/migrations` to the hosted project (`supabase link` + `supabase db push`, or paste the SQL into the SQL editor), then run `SEED_PASSWORD=… pnpm seed:users`. In Supabase Auth settings, set the Site URL and add the Vercel domains (`https://*.vercel.app/**`) to the redirect allow list.
- **Demo accounts** (`pnpm seed:users`): `teacher@demo.safesight.in` (Kavita Sharma), `riya@demo.safesight.in` (Riya Sharma), `admin@demo.safesight.in` (Arjun Mehta). Password `safesight-demo` locally; `SEED_PASSWORD` is required for a hosted project.
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
