# SafeSight

**AI that teaches, not answers.** SafeSight gives every student a tutor that builds real understanding, and gives every teacher a clear view of how AI is used in their class. Built at IIT Mandi.

> Status: Day 0. The plan and design are done; application code starts with session S1.

## What's in this repo

| Path | Purpose |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Product and build plan: scope, agents, design system, architecture, database, privacy, session prompts, demo script |
| [`CLAUDE.md`](CLAUDE.md) | Working rules and running status for Claude Code sessions |
| [`SESSIONS.md`](SESSIONS.md) | Build tracker: one Claude Code session per feature, S1 → S15 |
| [`design/`](design/) | Brand book, tokens, logo and the finished landing-page prototype |
| [`.env.example`](.env.example) | Every environment variable the app will need |

## Stack

Next.js (App Router, TypeScript) · Tailwind + shadcn/ui · Motion · Recharts · Supabase (Postgres, Auth, Storage, pgvector) · Vercel AI SDK with an OpenAI-compatible model provider · Tiptap · zod · Vercel hosting.

## Working on it

All building happens in Claude Code cloud sessions on this repo:

1. Open Claude Code on the web, pick this repo.
2. Start with: `Read CLAUDE.md and PLAN.md first.` then paste the next prompt from `SESSIONS.md`.
3. Review the PR and the Vercel preview on phone and laptop, then merge.

Local development (once S1 exists):

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

## Team

SafeSight is a student startup from the Essentials of Entrepreneurship course at IIT Mandi.

© 2026 SafeSight. All rights reserved.
