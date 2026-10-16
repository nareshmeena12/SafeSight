# SafeSight — Product & Build Plan

Oct 16, 2026 · @Naresh Meena

## 1. Vision and positioning

SafeSight is an AI tutor for colleges that coaches students instead of doing their work, and shows teachers how their class actually uses AI. The core idea in one line: **guide, don't guard.**

**One-liner for the pitch:** "SafeSight gives every student an AI that makes them think, and every teacher a clear view of how AI is used in their class."

**The problem**

- Students paste assignments into ChatGPT and submit the output. They pass the course but skip the learning.
- Teachers cannot see any of this. Bans do not work, because every student has a phone.
- AI-text detectors are unreliable and accuse honest students, so teachers stop trusting them.

**Why now**

- Almost every college student now uses AI tools daily, and institutions are writing AI policies with nothing to enforce them.
- Fast open models such as DeepSeek V4 Flash cost about $0.14 per million input tokens. That makes an AI tutor for every student affordable for an Indian college for the first time.

**How we are different from existing players**

- Securly, GoGuardian and Lightspeed sell monitoring and filtering to US schools (K-12) on school-managed devices. They watch students.
- SafeSight is a tool students choose to use, built for Indian colleges and coaching institutes. Because the tutor is useful, students use it instead of ChatGPT, and the teacher's visibility comes from that, not from surveillance.
- We show evidence of the writing process, not "AI-detector" guesses. Teachers see how work was made; the system never says "cheated".

## 2. Who it is for

The first market is Indian engineering colleges and coaching institutes. The first real customer we pitch is a department at our own college.

| Persona | Who they are | What they want | What SafeSight gives them |
| --- | --- | --- | --- |
| Student ("Riya") | 2nd-year B.Tech, uses ChatGPT for every assignment | Get unstuck fast, without being judged | A tutor that explains with hints, available 24x7 and tied to her course notes |
| Teacher ("Prof. Sharma") | Teaches 120 students, grades by hand | Know who is learning and who is copying, without policing | A class dashboard, AI rules per assignment, and an assistant ("Lens") that answers questions about the class |
| Admin (Dean, Academics) | Sets the college's AI policy | Proof the policy works, and responsible AI adoption | Usage reports across courses; this person signs the cheque |

**Who pays:** the institution. Students use it free; teachers and admins are who we sell to.

## 3. Product scope

The MVP has four parts: a tutor for students, a dashboard for teachers, an AI assistant for teachers, and a writing editor that records how work was made. Everything else waits for v2.

| Feature | User | What it does | Release |
| --- | --- | --- | --- |
| **Sage** (AI tutor) | Student | Chat tutor that gives hints and asks questions back instead of full answers; follows each assignment's AI rule | MVP |
| Course material search | Student | Sage answers from the teacher's uploaded notes and PDFs, and cites them | MVP |
| AI rules per assignment | Teacher | Each assignment gets a mode: Learn (hints only), Assist (explanations allowed), Exam (AI off) | MVP |
| Class dashboard | Teacher | Usage per student, topics the class is stuck on, Reliance Score, flags | MVP |
| **Lens** (teacher assistant) | Teacher | Ask in plain English: "who is over-relying on AI this week?"; get answers with charts | MVP |
| **Trace** (writing editor and replay) | Both | Records typing, pastes and time spent; teacher can replay how an answer was written | MVP |
| Landing website | Everyone | Marketing site with an interactive demo and a "request a pilot" form | MVP |
| Wellbeing flags | Teacher or counsellor | Flags chats that show distress, and shows the student help resources | MVP (basic) |
| Hindi and Hinglish tutor | Student | Sage replies in the student's language | v2 |
| Weekly email report | Teacher | Summary sent every Monday | v2 |
| LMS integration (Moodle, Google Classroom) | Admin | Import courses and students automatically | v2 |
| Code assignments | Both | Sage reviews code with hints; Trace records coding sessions | v2 |
| Admin analytics | Admin | Institution-wide AI usage reports | v2 |
| SafeSight for Work | Companies | Stops employees pasting sensitive data into AI tools | Later (separate product line) |

## 4. The AI agents

There are three agents, each with a narrow job and its own tools. Each one is a model call plus a fixed list of tools it may call; none of them can write raw database queries.

### Sage: the tutor (student side)

Before every reply, Sage checks the assignment's mode and the student's history, then picks one step on a **hint ladder**. It climbs one step only when the student has made a real attempt.

1. **Clarify:** ask what the student has tried and where they are stuck.
2. **Nudge:** name the concept or formula that applies, without applying it.
3. **Guide:** break the problem into steps; ask the student to do the first one.
4. **Parallel example:** solve a *similar* problem with different numbers, fully worked.
5. **Check work:** the student shares an attempt; Sage points to the exact line that is wrong.

Sage never gives the final answer to a graded assignment in Learn mode. In Assist mode it may explain fully, but never produce the deliverable itself (the essay, the full code). In Exam mode it refuses politely and logs the attempt.

| Tool | What it does |
| --- | --- |
| `get_assignment_policy` | Returns the mode and any teacher notes for this assignment |
| `get_student_progress` | Hints used so far, current ladder step, recent topics |
| `search_course_material` | Finds relevant passages in the teacher's notes and returns them with page references |
| `classify_message` | Labels the student's message: concept question, answer-seeking, pasted question, off-topic, distress |
| `log_interaction` | Saves the message, label and ladder step for the dashboard |
| `flag_to_teacher` | Raises a flag: repeated answer-seeking, exam-mode attempt, or wellbeing concern |

### Lens: the teacher's assistant

The teacher asks a question in plain English. Lens calls read-only tools, reasons over the results, and answers with names, numbers and a small chart. It can also draft things for the teacher to send.

| Tool | What it does |
| --- | --- |
| `get_class_overview` | Usage, average Reliance Score, active students, for a course and date range |
| `get_student_summary` | One student's usage, topics, flags and score trend |
| `get_topic_struggles` | Concepts the class asks about most, ranked |
| `list_flags` | Open flags by type and severity |
| `get_integrity_report` | The Trace summary for one submission |
| `draft_message` | Writes an email to a student for the teacher to review; never sends it |
| `generate_quiz` | Makes a 5-question revision quiz on the weakest topics |

### Trace: the integrity analyst (background)

When a student submits work written in the Trace editor, this agent reads the recorded events and writes a short, neutral evidence summary. For example: "Written over 3 sessions, 52 minutes active. One paste at 14:32 made up 78% of the final text." It reports evidence and never uses words like "cheated" or "AI-generated"; the teacher decides.

### Reliance Score (v1 formula)

A 0–100 score per student per week; higher means more dependence on AI. Start simple and tune it later:

```latex
\text{Reliance} = 100 \times (0.5\,a + 0.3\,p + 0.2\,e)
```

Here *a* = share of messages labelled answer-seeking, *p* = average share of submitted text that was pasted, and *e* = share of assignments where the student reached ladder step 4 without making an attempt.

### Guardrails for all three agents

- Sage ignores "ignore your instructions" or "pretend you are ChatGPT" requests, and the teacher sees those attempts as a flag.
- If a student shows signs of distress, Sage responds with care, shares the college counselling contact and a helpline, and raises a private flag.
- Every model reply that labels data (classification, the Trace summary) uses structured JSON output so the app can trust its format.

### Live Lab Mode (lab exams on college PCs)

Live Lab Mode extends Exam mode to the college's computer labs. It works better than monitoring personal devices, because the college owns the machines.

**How a lab exam runs**

1. The teacher creates a lab session: course, room, start and end time, and any extra blocked sites. SafeSight shows a 6-digit session code.
2. Each lab PC has the SafeSight Lab Chrome extension installed once by the lab admin. The student enters their roll number and the code, and a banner appears: "Exam session active: SafeSight is recording activity."
3. During the session the extension blocks AI sites (ChatGPT, Gemini, Claude, Copilot, DeepSeek, Perplexity, plus the teacher's list) and logs tab switches, copy and paste, attempts to open blocked sites, and idle time.
4. It sends a heartbeat every 10 seconds. A seat that goes silent (extension disabled, browser closed) is flagged.
5. The teacher watches a live grid of seats coloured green, amber or red, with an event feed ("Seat 14 tried to open ChatGPT twice"). Clicking a seat opens its timeline.
6. When the session ends, monitoring stops automatically. Each student gets an evidence summary in Trace's neutral style, and the teacher can download a CSV.

**New tables:** `lab_sessions` (course, room, code, start, end, blocklist), `lab_seats` (session, student, seat label, last heartbeat), `lab_events` (seat, type, detail, time).

**Limits to state openly:** it cannot see phones, so an invigilator is still needed; it covers Chrome only, so labs should set Chrome as the only browser (a desktop agent is a v2 option).

**Competition:** Safe Exam Browser (free, open-source), Respondus LockDown Browser and Mercer Mettl already lock down exams. Our edge is that Lab Mode focuses on AI misuse and is tied into the same course, Sage and Trace data.

**Release:** built right after the core build (sessions S13–S15 in section 10). If time is short, show it in the demo as a designed prototype only.

## 5. Brand and UI design system

The look is calm, warm and academic: it should feel like a good library, not a security camera. Every design choice below follows from that, and Claude Code must use these exact values.

**Voice:** encouraging, plain and never accusatory. Sage says "Let's work through this together," not "Request denied." Teacher-facing text uses neutral evidence ("78% pasted"), never "cheating".

**Logo idea:** a simple lens or aperture shape with a small spark inside. Avoid any eye symbol, because an eye reads as surveillance.

| Token | Light mode | Dark mode | Used for |
| --- | --- | --- | --- |
| Background | `#FAF8F3` warm paper | `#0E1015` | Page background |
| Surface | `#FFFFFF` | `#171A22` | Cards, panels, chat bubbles |
| Text | `#14161F` | `#ECEDEE` | Body and headings |
| Muted text | `#6B6F7B` | `#9BA0AB` | Labels, timestamps |
| Primary (Sage) | `#1F6F5C` deep teal-green | `#4FB59A` | Buttons, links, the student's brand colour |
| Accent (Insight) | `#F2A93B` amber | `#F5B95A` | Highlights, the one thing to notice on a screen |
| Good | `#2E9D6A` | `#4CC38A` | Healthy scores, success |
| Warning | `#D99A00` | `#F0B429` | Medium Reliance Score, attention |
| Critical | `#D14B45` | `#F07167` | Flags, Exam-mode attempts |
| Border | `#E7E3DA` | `#262A35` | Card borders, dividers |

**Typography** (all free on Google Fonts):

- **Headlines:** Instrument Serif. An editorial serif gives the academic, trustworthy feel; use it only for large marketing headlines and page titles.
- **Interface and body:** Geist (or Inter as a fallback), 15–16 px body, 1.6 line height.
- **Code and numbers:** Geist Mono, for code blocks in Sage and figures in the dashboard.

**Building blocks**

- **Components:** shadcn/ui (buttons, dialogs, tables, tabs), restyled with the tokens above. This is the standard for good-looking React apps and Claude Code knows it well.
- **Icons:** Lucide, 1.5 px stroke, one size per context.
- **Charts:** Recharts, using only the tokens above. One accent colour per chart.
- **Motion:** the Motion library (formerly Framer Motion). Transitions 150–250 ms, ease-out; streamed chat text; cards fade up 8 px on load. Nothing bounces or spins.
- **Layout:** 8 px spacing grid, 12-column grid on desktop, max content width 1200 px, 16 px rounded corners on cards, soft 1 px borders instead of heavy shadows.
- **Dark mode** from day one, following the visitor's system setting.
- **Mobile-first:** students use phones, so the Sage chat and the Trace editor must work well at 375 px wide.

**References to show Claude Code:** Linear (dashboard density and calm), Notion (reading comfort), Duolingo (encouraging feedback). Show these as a feel, never copy their designs.

**Quality bar before anything ships:** consistent spacing, no placeholder text, empty states designed ("No flags this week — your class is doing well"), loading skeletons instead of spinners, readable contrast in both modes.

### Landing page animations

Animations should guide the eye to the story, never decorate. Each one below has a job.

| Section | Animation | Its job |
| --- | --- | --- |
| Hero | Headline words fade up one after another (60 ms apart); the Sage demo chat types the student's message, then streams Sage's hint | Shows the product in the first 5 seconds |
| Problem stats | Numbers count up when scrolled into view | Makes the figures land |
| Before and after | Scroll-triggered: the left chatbot dumps a full answer instantly; the right Sage asks a question back | The core idea in one glance |
| How it works | A line draws itself between the three steps as you scroll | Shows the flow from teacher to student to insight |
| Dashboard preview | The screenshot starts tilted in 3D and flattens as it scrolls in; callouts pop in one by one | Makes the product feel real and premium |
| Live Lab Mode | A mini grid of seats where one turns amber with a small alert | Shows the lab feature in 2 seconds |
| Agent cards | Lift slightly and glow in the brand colour on hover | Invites exploration |

Rules: build with the Motion library; 150–600 ms durations; animate only position, opacity and scale (keeps it smooth on cheap phones); turn all motion off when the visitor's system asks for reduced motion.

### Designing the UI in Claude Design

Claude Design is Anthropic's visual design workspace (in research preview, included in the Pro plan). Design the landing page and key screens there first, then hand them to Claude Code to build. Do this before S2 and S10, ideally on Oct 17–19 alongside S1 and S3.

1. **Open it** at claude.ai/design, or from the sidebar of the Claude desktop app.
2. **Set up the design system first.** Without one, Claude Design invents its own style and output looks generic. Create a design system with the colours, fonts, spacing, 16 px corners and voice from this section. Later, once S2 exists in code, run `/design-sync` in Claude Code to bring the real code's design system into Claude Design so both match.
3. **Create a project** called "SafeSight landing page". As the first message, paste sections 1, 5 and the landing-page part of section 6, plus 2–3 screenshots of sites whose feel you like.
4. **Ask for 3 directions for the hero only.** Pick one, then build the page section by section rather than all at once; each step stays sharp.
5. **Make it interactive:** ask for the animations in the table above as a clickable prototype, so you can feel the motion before any code exists.
6. **Design the key app screens** in the same project, at both phone and laptop sizes: Sage chat, teacher overview, submission replay, and the Live Lab seat grid.
7. **Review hard:** ask Claude Design to critique each screen for hierarchy, spacing, contrast and dark mode; show it to 3 classmates and fix what confuses them.
8. **Hand off to Claude Code** from the Export menu (top right): "Handoff to Claude Code" or "Send to Claude Code Web". Then start S2 or S10 with: "Build this design in our Next.js app using our tokens and shadcn/ui; match it pixel for pixel; use Motion for the animations."
9. **Keep the design as the source of truth.** For a visual change, edit it in Claude Design first, then hand off or sync again, so design and code don't drift apart.

Note: Claude Design shares usage limits with chat and Claude Code, so do the heavy design work early, while you are also using the cloud-session credit for code.

## 6. Screens and pages

There are three areas: the public website, the student app and the teacher app. Each one is a separate section of one Next.js project, and login sends each user to their own area by role.

### Public website (the landing page sells the idea in 30 seconds)

1. **Hero:** headline "AI that teaches, not answers." with one supporting line, two buttons ("Try Sage" and "Request a pilot"), and on the right a live, scripted Sage chat that types out a hint conversation.
2. **The problem in numbers:** three large stat cards about student AI use and teacher visibility. Use only real, cited figures.
3. **Before and after:** two chat windows side by side. Left: a generic chatbot pastes a full answer. Right: Sage asks a question back. This is the clearest way to explain the product.
4. **How it works:** three steps with icons: teacher sets the AI rule, student learns with Sage, teacher sees insights.
5. **Teacher dashboard preview:** a large, slightly tilted screenshot of the real dashboard with three callouts.
6. **Meet the agents:** three cards for Sage, Lens and Trace, one line each.
7. **Privacy-first:** what we store, what we never do, who sees what.
8. **Pilot call-to-action:** form with name, institution, role and email (saved to the database).
9. **Footer:** about, team, contact.

Extra pages: `/about` (team and story), `/privacy`, `/login`, `/signup`.

### Student app

| Screen | What is on it |
| --- | --- |
| Home | Enrolled courses as cards, upcoming assignments with their AI mode badge, "Continue with Sage" |
| Sage chat | Chat with streaming replies; assignment and mode shown in the header; a small "hint level" progress indicator; cited notes appear as clickable chips; code and maths render properly |
| Assignment | Instructions, due date, AI mode explained in one line, "Write in Trace" button |
| Trace editor | Clean writing space (Notion-like) with autosave; a note that the writing process is recorded; Submit button |
| My learning | The student's own topics and progress. Students see their own data, which builds trust |

### Teacher app

| Screen | What is on it |
| --- | --- |
| Overview | Four stat cards (active students, AI conversations, average Reliance Score, open flags), a weekly trend chart, top 5 struggling topics, and the Lens box: "Ask anything about your class" |
| Courses and assignments | Create a course, invite students with a join code, create assignments and pick the AI mode, upload notes and PDFs |
| Students | Sortable table with name, conversations, Reliance Score (coloured badge) and flags; click opens a student's detail page |
| Student detail | Score trend, topics asked about, flags; full chats shown only for flagged items |
| Flags | List of flags with severity, reason and "resolve" or "open chat" actions |
| Submission replay | Trace timeline: a scrubber that replays the writing; paste events highlighted in amber; the agent's evidence summary at the top |
| Lens (full page) | Chat with Lens; answers include tables and small charts; "Draft email" and "Make quiz" buttons |

## 7. Tech architecture

SafeSight is one Next.js project hosted on Vercel, with Supabase for data and an outside model provider for AI. You never have to run a server yourself.

&#91;embedded content: SafeSight architecture · 3 layers, 3 agents\]

The browser never talks to the model directly. All three agents run in server routes, so keys stay hidden and every tool call is checked.

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | Next.js (App Router) with TypeScript | Website, student app, teacher app and server routes in one project |
| Styling | Tailwind CSS and shadcn/ui | The standard for polished React apps; easy to apply our tokens |
| Animation | Motion | Smooth, subtle transitions |
| Charts | Recharts | Simple charts in the dashboard and in Lens answers |
| Database, login, files | Supabase | Postgres, authentication and storage in one free service |
| Note search | pgvector inside Supabase | No separate vector database needed |
| AI framework | Vercel AI SDK | Streaming chat, tool calling and JSON output, and works with any provider |
| Model access | OpenRouter or DeepInfra (OpenAI-compatible) | Switching models is a one-line change |
| Trace editor | Tiptap | A rich-text editor that exposes typing and paste events |
| Input checks | zod | Validates every form and tool input on the server |
| Hosting | Vercel | Free, and deploys automatically on every push to GitHub |

## 8. Database

The database holds 14 tables in Supabase (Postgres). Row-level security means each student can read only their own rows, and each teacher only their own courses.

| Table | Key columns | Purpose |
| --- | --- | --- |
| `institutions` | id, name, city | A college or coaching institute |
| `profiles` | id, institution\_id, role (student, teacher, admin), full\_name | One row per logged-in user |
| `courses` | id, teacher\_id, name, code, join\_code | A course a teacher runs |
| `enrollments` | course\_id, student\_id | Which students are in which course |
| `assignments` | id, course\_id, title, instructions, ai\_mode (learn, assist, exam), teacher\_notes, due\_at | The AI rule lives here |
| `materials` | id, course\_id, title, file\_path | Uploaded notes and PDFs |
| `material_chunks` | id, material\_id, content, page, embedding (vector) | Searchable pieces of the notes, using pgvector |
| `conversations` | id, student\_id, assignment\_id, started\_at | One Sage chat thread |
| `messages` | id, conversation\_id, role, content, intent, hint\_level, created\_at | Every message, with its label and ladder step |
| `submissions` | id, assignment\_id, student\_id, content, submitted\_at | Final work from the Trace editor |
| `writing_events` | id, submission\_id, type (type, paste, delete, focus, blur), size, at | Recorded editing events, batched every few seconds |
| `integrity_reports` | id, submission\_id, paste\_ratio, active\_minutes, sessions, summary | Trace's evidence summary |
| `flags` | id, student\_id, course\_id, type, severity, message\_id, status | Things the teacher should look at |
| `weekly_metrics` | student\_id, course\_id, week, messages, answer\_seeking\_share, reliance\_score | Pre-computed numbers so the dashboard loads fast |

One extra table, `pilot_requests`, stores the landing page form.

## 9. Privacy, safety and security

Privacy is the pitch, so these rules are part of the product, not an afterthought. Each one is also a line we can say to the professor.

**Privacy**

- Teachers see summaries and scores by default. Full chat text opens only for flagged items, or when the student shares a chat.
- Students see all their own data on the "My learning" page.
- A one-time consent screen at signup explains in plain words what is recorded and who sees it.
- The model is called through a US-hosted provider (DeepInfra or Together AI), not DeepSeek's own servers. No student data is used to train models.
- Chats and writing events are deleted after 180 days; only aggregate numbers are kept.
- Demo data uses invented names only. Real students in testing take part only with their consent.

**Safety**

- Distress in a chat: Sage responds with care, shows the college counselling contact and a helpline, and creates a private high-priority flag.
- The words "cheating" and "AI-generated" never appear in the product. Trace reports evidence; humans decide.

**Security (Claude Code must follow these)**

- All API keys live in server-side environment variables. Model calls happen only in Next.js server routes, never in browser code.
- Supabase row-level security is on for every table, and there is a test that a student cannot read another student's messages.
- Rate limit: about 60 Sage messages per student per hour, to protect the budget.
- Lens tools are read-only and limited to the teacher's own courses.
- Every form input is validated on the server (with the zod library).
- A `.env.example` file is committed; the real `.env` file never is.

## 10. Build plan

The build is 12 Claude Code sessions over 19 days, finishing before the cloud credit expires around Nov 4. Each stage leaves a complete, demo-able product, so if time runs out we still have something to show.

&#91;embedded content: Build timeline · 12 sessions, Oct 17 to Nov 12\]

The week after the build goes to testing with real students and rehearsing the demo. The demo date itself is still an open question.

### Day 0: set up (you, about 1 hour)

- [ ] Create accounts: GitHub, Supabase, Vercel, and DeepInfra or OpenRouter (section 11)
- [ ] Create a private GitHub repo `safesight` and connect it to Claude Code on the web
- [ ] Export this doc as Markdown and add it to the repo as `PLAN.md`
- [ ] Put the Supabase and model keys in Vercel's environment settings (never in code)

### How to run each session

- Start every session with: "Read PLAN.md and CLAUDE.md first." Then paste the session prompt below.
- One session = one feature. When it is done, check the Vercel preview link on your phone and laptop, and paste any problems back in plain words or as screenshots.
- If the frontend-design skill or plugin is available in Claude Code, turn it on for S2 and S10.
- At the end of each session ask: "Update CLAUDE.md with what you built and anything the next session must know."

### Session prompts

1. **S1, scaffold:** "Create a Next.js project (App Router, TypeScript) with Tailwind and shadcn/ui. Set up Supabase email login with three roles: student, teacher, admin. After login, send students to /student and teachers to /teacher. Add .env.example. Write CLAUDE.md summarising the stack, folder structure and the rules in PLAN.md sections 5, 7 and 9."
2. **S2, design system:** "Implement the design tokens in PLAN.md section 5 as CSS variables with light and dark mode. Load Instrument Serif, Geist and Geist Mono. Restyle the shadcn components to match. Build the app shell (sidebar, top bar, page header) for both apps, and a /design page that shows every component so we can check the look."
3. **S3, database:** "Create Supabase migrations for every table in section 8, with row-level security on each. Add a test proving a student cannot read another student's messages. Write a seed script: one institution, one teacher, two courses, 30 students with invented Indian names."
4. **S4, Sage chat:** "Build the Sage chat at /student/sage/\[assignmentId\] with the Vercel AI SDK and an OpenAI-compatible provider (base URL and model name from environment variables). Streaming replies, markdown, maths and code rendering, the hint ladder and modes from section 4 in the system prompt, and the mode badge in the header. Save every message."
5. **S5, labels and flags:** "Add classify\_message using structured JSON output; save intent and hint level per message. Implement the flag\_to\_teacher rules and a rate limit of 60 messages per hour per student. Create 30 trick prompts and a script that runs them and lists any reply that gives away a full answer."
6. **S6, notes search:** "Let teachers upload PDFs to Supabase storage. Extract text, split into chunks of about 500 tokens with page numbers, embed them, and store them in material\_chunks with pgvector. Give Sage a search\_course\_material tool and show cited pages as chips under the reply."
7. **S7, teacher dashboard:** "Build the teacher screens in section 6: overview, courses and assignments (AI mode picker, join code), students table, student detail and flags. Compute weekly\_metrics and the Reliance Score using the formula in section 4."
8. **S8, Lens:** "Build Lens as a box on the overview page and as a full page. Give it the tools in section 4, read-only and limited to the teacher's own courses. Answers can include a table or a small Recharts chart. Add Draft email and Make quiz buttons."
9. **S9, Trace:** "Build the Trace editor with Tiptap: autosave, and record typing, paste, delete and focus events, sent in batches every 5 seconds to writing\_events. Add submission, the teacher replay page with a timeline scrubber and paste events in amber, and the Trace agent that writes the integrity report in neutral words."
10. **S10, landing page:** "Build the public landing page described in section 6, using the brand in section 5. Animated scripted Sage chat in the hero, before-and-after section, how it works, dashboard preview, the three agents, privacy, and a pilot form saved to pilot\_requests. It must feel premium: generous white space, serif headlines, subtle Motion animations, perfect on mobile."
11. **S11, demo data:** "Generate 4 weeks of realistic activity for the 30 seeded students: 5 heavy copiers, 15 healthy learners, 10 light users. Include conversations, submissions with writing events, and flags, so every chart and table looks alive."
12. **S12, polish and launch:** "Check every screen for empty states, loading skeletons, the layout at 375 px wide, dark-mode contrast and friendly error messages. Add demo mode, which switches to the fallback model if the first one is slow. Deploy to Vercel and fix any production errors."

### After the core build: Live Lab Mode (Nov 5–8)

These sessions run after the credit expires, on normal Pro usage, alongside student testing.

1. **S13, lab sessions and extension:** "Read the Live Lab Mode spec in PLAN.md section 4. Add the lab\_sessions, lab\_seats and lab\_events tables with row-level security. Build a Chrome extension (Manifest V3) that activates only with a valid session code and roll number, shows the 'exam session active' banner, blocks the AI domain list plus the teacher's list, logs tab switches, copy, paste, blocked-site attempts and idle time, and sends a heartbeat every 10 seconds. It must stop by itself when the session ends."
2. **S14, live teacher grid:** "Build the teacher lab pages: create a session and show its code; a live grid of seats coloured green, amber or red, updated with Supabase Realtime; an event feed; click a seat to open its timeline. Flag any seat with no heartbeat for 30 seconds."
3. **S15, report and test:** "After a session ends, generate each student's evidence summary in Trace's neutral style and add a CSV download. Write a test script that simulates 30 seats sending events, so we can rehearse the demo without a real lab."

Before installing anything on real lab PCs, get written permission from the course instructor and the lab administrator.

## 11. Costs and accounts

The whole MVP should cost about $5–15 in real money. Building is covered by the $100 Claude Code cloud-session credit, and everything else runs on free tiers. Set up these accounts on day 0 (about an hour):

| Service | Used for | Cost | Note |
| --- | --- | --- | --- |
| GitHub | Code repository; cloud sessions need it | Free | Make a private repo named `safesight` |
| Claude Code cloud sessions | Writing the code | $100 promo credit, then normal Pro usage | Credit reportedly expires around Nov 4, so the heavy building happens before then |
| Supabase | Database, login, file storage, vector search | Free tier | One project; save the URL and keys |
| Vercel | Hosting the website | Free (Hobby plan) | Connect the GitHub repo; every push deploys automatically |
| DeepInfra or OpenRouter | The language model behind Sage, Lens and Trace | Add about $5; expect under $3 of use | Default model: DeepSeek V4 Flash; fallback: a Gemini Flash model |
| Embeddings (same provider) | Searching course notes | A few cents | Any small embedding model |
| Domain name (optional) | A real URL such as safesight.in | Roughly ₹700–1,200 a year (approximate) | Nice for the pitch, not required |

**Rule for the credit:** one feature per cloud session, each started with a clear prompt from section 10. Small text and colour fixes are done locally or by hand, so the credit goes to real building.

## 12. Demo script for the professor

The demo runs 7 minutes and tells one story: a student tries to cheat, Sage teaches instead, and the teacher sees it all. Keep two browser windows logged in (student and teacher) and a recorded backup video ready.

1. **Landing page (45 s):** scroll the hero and the before-and-after section. Say: "Banning AI does not work. We make AI teach."
2. **Teacher sets the rule (45 s):** create the assignment "Thermodynamics problem set 3" with mode **Learn**, and upload the lecture notes PDF.
3. **Student tries to cheat (1 min 30 s):** paste the whole question into Sage and ask for the answer. Sage asks what the student has tried. Insist twice; Sage moves to a nudge, then to a guiding step, and cites page 12 of the notes. The audience sees it hold its ground.
4. **Student writes in Trace (45 s):** type a little, then paste a large block, then submit.
5. **Teacher dashboard (1 min):** the overview with the seeded class data; the new flag for repeated answer-seeking appears; the student's Reliance Score is in the amber band.
6. **Replay (45 s):** open the submission replay; the paste shows in amber, and Trace's summary reads "one paste made up 70% of the final text".
7. **Lens (1 min):** ask "Which concepts is my class struggling with, and who needs help?" Lens answers with names and a small chart. Click "Make quiz" to get a revision quiz on the weakest topic.
8. **Close (30 s):** privacy points, the pricing hypothesis, and the pilot plan.

**Before the demo:** turn on "demo mode" (a setting that switches to a faster fallback model if the first one is slow), clear the student's test chats, and test the full run twice on the venue's Wi-Fi.

## 13. Business model, metrics, roadmap and risks

The model is a yearly licence per student, paid by the institution. Our working guess is ₹500 per student per year. The AI cost per student is about ₹100 a year, which leaves a healthy margin.

**How the ₹100 is estimated (assumption):** one Sage message is about 1,500 input and 400 output tokens, which costs roughly $0.0003 at DeepSeek V4 Flash prices. A heavy user sends about 300 messages a month, so the cost is about $0.10 a month or $1.2 a year. Cached system prompts make it cheaper.

**Market (approximate):** Indian higher education has around 4.3 crore students (AISHE 2021–22). A college of 3,000 students at ₹500 each is ₹15 lakh a year.

**Metrics that prove it works**

- Weekly active students (share of enrolled students who use Sage).
- Learning rate: share of stuck conversations the student solves themselves by ladder step 3.
- Reliance Score trend: should fall over the semester.
- Teachers who open the dashboard at least once a week.

**Roadmap**

1. **MVP and demo (Oct–Nov 2026):** everything in section 3 marked MVP.
2. **Pilot (Jan–Apr 2027):** one department at our college; add Hindi and Hinglish, weekly email reports, code assignments.
3. **Paid launch (Jul 2027 onwards):** LMS integrations, admin analytics, coaching institutes; then SafeSight for Work as a second product line.

**Risks**

| Risk | Why it matters | What we do about it |
| --- | --- | --- |
| Students still use ChatGPT on their phones | Sage only works if students choose it | Make Sage better for coursework: it knows the course notes, never judges, and Learn mode can be the course's only allowed AI |
| Sage gives the answer anyway | Breaks the core promise | Hint ladder in the prompt, an output check before each reply, and a test set of 30 "trick" prompts run before every demo |
| Big players (Securly, GoGuardian) enter Indian colleges | They have money and sales teams | Move fast, go local (Indian languages, pricing in rupees), win colleges through faculty relationships |
| Students or parents call it surveillance | Bad reputation kills adoption | Summaries by default, students see their own data, clear consent |
| Credit or time runs out | MVP left half-done | Build in the order of section 10, so each stage is a complete demo by itself |

## 14. Customer discovery and pitch

By Nov 12 the team should have 10 professor interviews, 40 or more student survey responses, and at least one professor who agrees to pilot SafeSight. Evidence like this convinces judges more than features do.

**Rules for interviews:** ask about what people actually did in the past, not what they might do; don't pitch until the last 5 minutes; write down exact quotes; keep the student survey anonymous.

**Professor interview (20 minutes)**

1. How do you handle students' AI use in assignments and labs today?
2. Tell me about the last time you suspected AI misuse. What did you do?
3. What have you tried (bans, detectors, vivas)? What worked and what didn't?
4. Are there assignments where you'd *want* students to use AI? Which ones?
5. What would you most like to know about how your class uses AI?
6. How do lab exams work today, and how do you stop AI use in them?
7. (After a 2-minute demo) Would you try this in one course or one lab next semester?
8. Who in the college decides whether to adopt a tool like this?

**Student survey (anonymous, 3 minutes)**

1. How often do you use AI tools for coursework? (daily / weekly / rarely / never)
2. What for? (understanding concepts, assignments, code, exam prep, other)
3. Roughly what share of your submitted assignments was mostly written by AI? (0%, under 25%, 25–50%, over 50%)
4. Do you feel you learn less when AI does the work? (scale of 1–5)
5. Would you use an AI tutor that knows your course notes but gives hints instead of answers?
6. How comfortable are you with teachers seeing a summary (not full chats) of your AI use? (scale of 1–5)
7. What would make you avoid such a tool?
8. Do you mostly study on a phone or a laptop?

**Pitch deck outline (10 slides)**

1. Title and one-liner
2. Problem, with survey numbers and one professor quote
3. Why now
4. Solution: Sage, Lens, Trace and Live Lab Mode
5. Live demo (or the backup video)
6. Market and who pays
7. Business model and unit economics (section 13)
8. Competition and our edge
9. Traction: interviews, survey, pilot commitment
10. Team, roadmap and the ask

## Sources

- [Securly: 1.2 million student AI conversations in 80 days](https://www.securly.com/aiusageinsights)
- [Education Week: real-time data on student AI use](https://www.edweek.org/technology/real-time-data-shows-exactly-how-students-use-ai-on-school-technology/2026/03)
- [DeepSeek V4 Flash pricing calculator](https://trevorfox.com/tools/calculators/llm-cost/deepseek/deepseek-v4-flash/)
- [DeepSeek V4 Flash providers and capabilities](https://modelcompare.dev/models/deepseek/v4-flash)
- [BleepingComputer: Claude Code cloud-session credits](https://bleepingcomputer.com/news/artificial-intelligence/anthropic-rolls-out-up-to-250-in-free-claude-code-credits-but-only-for-cloud-sessions)

* [Claude Help Center: Get started with Claude Design](https://support.claude.com/en/articles/14604416)
* [TechRepublic: Claude Design adds design system imports and Claude Code sync](https://techrepublic.com/article/news-anthropic-claude-design-overhaul-enterprise-teams)
