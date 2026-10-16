# Build sessions

One Claude Code cloud session = one feature. Start every session with:

```
Read CLAUDE.md and PLAN.md first. Then do session S<N> from SESSIONS.md.
```

At the end of each session: tick the box here, update **Status** and **Handoff notes** in `CLAUDE.md`, and open a PR into `main`.

Target: S1–S12 before the cloud credit expires (~Nov 4, 2026). S13–S15 (Live Lab Mode) follow on Nov 5–8.

## Day 0 — accounts (by hand, ~1 hour)

- [x] Private GitHub repo `safesight` with PLAN.md, CLAUDE.md, design reference
- [ ] Connect the repo to Claude Code on the web (claude.ai/code → add repo / install the Claude GitHub app on it)
- [ ] Supabase project created; save the project URL, anon key and service-role key
- [ ] Vercel project imported from this repo (Framework: Next.js). Add the env vars from `.env.example` in Vercel settings
- [ ] Model provider account (DeepInfra or OpenRouter), ~$5 credit, API key saved in Vercel and in the cloud environment's secrets

## Core build

- [x] **S1 — Scaffold.** Create a Next.js project (App Router, TypeScript, pnpm) with Tailwind and shadcn/ui. Set up Supabase email login with three roles: student, teacher, admin. After login, send students to /student and teachers to /teacher. Keep `.env.example` in sync. Add `lint`, `typecheck` and `test` scripts. Update CLAUDE.md with the folder structure.
  *Done when:* `pnpm build` passes, a seeded teacher and student can log in and land on their area, Vercel preview deploys.

- [x] **S2 — Design system.** Implement `design/tokens.json` (PLAN.md §5) as CSS variables with light and dark mode. Load Instrument Serif, Geist and Geist Mono. Restyle the shadcn components to match. Build the app shell (sidebar, top bar, page header) for both apps, and a /design page that shows every component.
  *Done when:* /design looks right in both themes at 375px and 1440px.

- [x] **S3 — Database.** Supabase migrations for every table in PLAN.md §8 (plus `pilot_requests`), with row-level security on each. A test proving a student cannot read another student's messages. Seed script: one institution, one teacher, two courses, 30 students with invented Indian names.
  *Done when:* migrations apply cleanly on a fresh project and the RLS test passes.

- [x] **S4 — Sage chat.** /student/sage/[assignmentId] with the Vercel AI SDK and an OpenAI-compatible provider (base URL and model from env). Streaming, markdown, maths and code rendering, the hint ladder and modes from PLAN.md §4 in the system prompt, mode badge in the header. Save every message.

- [x] **S5 — Labels and flags.** `classify_message` with structured JSON output; save intent and hint level per message. `flag_to_teacher` rules and a 60 messages/hour/student rate limit. 30 trick prompts plus a script that lists any reply that gives away a full answer.

- [x] **S6 — Notes search.** Teacher PDF upload to Supabase Storage; extract text, chunk (~500 tokens, with page numbers), embed into `material_chunks` with pgvector. `search_course_material` tool for Sage; cited pages as chips under replies.

- [x] **S7 — Teacher dashboard.** Overview, courses and assignments (AI mode picker, join code), students table, student detail, flags. Compute `weekly_metrics` and the Reliance Score (PLAN.md §4).

- [x] **S8 — Lens.** Box on the overview and a full page. Tools from PLAN.md §4, read-only and limited to the teacher's own courses. Answers can include a table or small Recharts chart. Draft email and Make quiz buttons.

- [x] **S9 — Trace.** Tiptap editor with autosave; record type, paste, delete and focus events, batched every 5s to `writing_events`. Submission, teacher replay page with scrubber and amber paste events, and the Trace agent's neutral integrity report.

- [ ] **S10 — Landing page.** Build the public landing page, /login and /signup from `design/landing/` (read `design/README.md` first). Match copy, layout, mobile layouts and animations; use Motion. Pilot form saves to `pilot_requests` through a zod-validated API route. Also /about and /privacy.

- [ ] **S11 — Demo data.** Four weeks of realistic activity for the 30 seeded students: 5 heavy copiers, 15 healthy learners, 10 light users. Conversations, submissions with writing events, flags.

- [ ] **S12 — Polish and launch.** Empty states, loading skeletons, 375px layouts, dark-mode contrast, friendly errors. Demo mode (fallback model if the first is slow). Deploy to production and fix errors.

## Live Lab Mode (after the core)

- [ ] **S13 — Lab sessions and extension.** `lab_sessions`, `lab_seats`, `lab_events` with RLS. Chrome extension (Manifest V3): activates only with a valid session code and roll number, shows the "exam session active" banner, blocks the AI domain list plus the teacher's list, logs tab switches, copy, paste, blocked-site attempts and idle time, heartbeat every 10s, stops by itself when the session ends.

- [ ] **S14 — Live teacher grid.** Create a session and show its code; live seat grid (green / amber / red) via Supabase Realtime; event feed; click a seat for its timeline; flag seats with no heartbeat for 30s.

- [ ] **S15 — Report and test.** Per-student evidence summary in Trace's neutral style after the session, CSV download, and a script that simulates 30 seats so the demo can be rehearsed without a lab.

> Before installing anything on real lab PCs, get written permission from the course instructor and the lab administrator.
