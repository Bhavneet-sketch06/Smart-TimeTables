# College Timetable Generator

Generate clash-free weekly timetables for any college. Timetables are generated in the browser; with Supabase
configured, people **sign in** (new accounts wait for an administrator's approval) and share one college database, and each account sees only what its
role allows (enforced by Row Level Security in the database).

## Try it
```bash
npm install
npm run dev
```
- **With accounts** (Supabase): follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) (env variables, migrations,
  first administrator, inviting users). Sign in as administrator → **Setup** → **Load GNDEC demo** → **Sections** →
  **Generate whole college**.
- **Browser-only demo** (no Supabase values in `.env.local`): open http://localhost:5173 → **Administrator** →
  **Load GNDEC demo (CSE + sample departments)** or **Load demo college** → **Sections** → **Generate whole college**.
  Data stays in that browser and anyone can pick any role; it is for trying the app, not for real use.

Use the ☀️ / 🌙 / 💻 switch for light, dark or system theme.

## GNDEC Ludhiana data
`src/data/gndecCse.js` models the CSE department's B.Tech 3rd and 5th semesters (sections A–F each, 354 classes a week)
from public documents on cse.gndec.ac.in: the July–Dec 2026 subject allotment, the published timetable's structure
(08:30–17:30, lunch 12:30–13:30, labs in half-groups A1/A2) and the room/lab infrastructure lists. It generates in
well under a second with zero clashes. It is a realistic sample, **not** the official GNDEC timetable.

Every timetable has a **Print** button that prints just the timetable on one A4 landscape page.

## Departments
The department bar (CSE, ECE, ME, Civil, EE in the GNDEC demo) sets the context for timetables, setup lists,
generation and bookings.
- **Administrator**: any department or *All departments*; can set up and generate one department or the whole college.
- **HOD / Coordinator**: their assigned department only.
- **Faculty / Student**: their assigned department; faculty still see their full week if they teach in several departments.

With accounts, the department (and the faculty identity or student section) comes from the account's profile, set by
an administrator in the **Users** tab; nobody can choose or change their own. In the browser-only demo these are
picked on screen instead.

Rooms are shared college-wide. Generating one department keeps every other department's classes and works around
their rooms and shared teachers, so a room can never be double-booked across departments. In the GNDEC demo, CSE is
built from real GNDEC documents; ECE, Mechanical and Civil are **sample** departments (made-up faculty and subjects)
that share lecture theatres and Applied Sciences/Humanities teachers; Electrical is listed but not set up.

## Book a Space
Faculty, HODs and admins can book rooms for one-off events (workshops, seminars, guest lectures, extra classes,
meetings) from the **Book a space** tab: event details → date & time (with optional setup/cleanup time) → choose
from the rooms that are free for the whole period → review → confirm. A room is offered only if it is big enough,
of the right type, has the requested equipment, and has no regular class and no other booking in that interval.
If nothing fits, the app says why and suggests nearby free times. Confirmed bookings get a printable receipt
with a booking ID, and appear under **My bookings** (faculty) or **All bookings** (HOD/admin), where they can be
cancelled. Loading the GNDEC or demo data adds three sample bookings for the next working day.

## Evaluator demo: no sign-in (switch)
For evaluations, set `VITE_LOCAL_DEMO=true` in Vercel (Project → Settings → Environment Variables, Production) and
redeploy. The live site then opens without sign-in: the landing page offers Administrator, HOD, Faculty and Student,
"Switch role" goes back, and a first visit starts with the GNDEC college and its generated timetable. Everything runs
in the visitor's browser (nothing reaches the shared Supabase data), and Ask AI / Reschedule work, limited to 30 AI
requests per visitor per 10 minutes (also set a monthly spending limit in the Anthropic Console). To bring sign-in
back, delete the variable and redeploy: accounts and shared data are untouched.

## AI change assistant (administrators)
In the administrator's **Reschedule** tab, type a sudden change in plain words ("Dr. Kapil Sharma is on
leave this Wednesday", "Convocation on Friday in the first two periods", "Software Lab-I is closed for AC repair").
Claude (`api/change.js`) turns it into exact changes, which the app checks against the college data and shows for
approval; **Apply** regenerates around every class the change doesn't affect (those stay exactly where they were).
Claude then drafts an announcement from the exact list of moved classes; after you edit and publish it, students
and teachers see it in their **Notice** tab (with a badge until they open it), together with their moved classes,
which are also marked "Moved" on their timetables. The AI only proposes:
nothing changes until you click Apply, and only administrators can use it. Needs `ANTHROPIC_API_KEY` like Ask AI.

## AI timetable assistant
The **Ask AI** button (bottom-right of every app screen) answers questions about the current timetable, e.g.
"When is D3 CS A free on Wednesday?". It calls `api/chat.js`, which uses Claude (`claude-opus-5-5`) on the server so
the API key is never sent to the browser.

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY=...` (get a key at https://console.anthropic.com).
2. Restart `npm run dev`.
3. On Vercel: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`, then redeploy.

## Roles
- **Administrator**: 5-step setup wizard (time structure → rooms → subjects → teachers → sections), then generate and
  review; reviews space requests; with accounts, assigns roles in **Users**.
- **HOD / Coordinator**: their department's timetables by section, teacher or room, with clash count and quality
  score; joint free times with other departments (free/busy only).
- **Faculty**: their own weekly schedule (optionally one year/class such as D2 or D3) and their department's timetables.
- **Student**: their section's read-only, mobile-friendly timetable; requests rooms for student activities.

## How the scheduler works (`src/scheduler.js`)
1. **Pre-check** catches impossible input up front (over-loaded teachers, rooms too small, labs longer than the gap between breaks, not enough lab blocks) and explains it in plain language.
2. Each lecture hour becomes a 1-period unit; each subject's lab becomes one block of consecutive periods that needs a lab room.
3. **Backtracking search** always places the most-constrained unit next (fewest legal slots left). Teacher, room and section busy grids make every clash check O(1).
4. Candidate slots are ordered by a **soft score**: spread a subject across the week, avoid more than 3 back-to-back periods for a teacher, balance teachers' days, prefer snug rooms.
5. A **step limit with random restarts** and a time budget keep it responsive; on failure it reports which class couldn't be placed and why.
6. An independent **clash verifier** and **quality score** (0–100) check every result.

The demo college (3 departments, 6 sections, 12 teachers, 8 rooms, 114 classes) solves in about 100 ms with zero clashes.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | dev server |
| `npm test` | app tests and database RLS tests (Vitest, in-process Postgres) |
| `npm run build` | production build to `dist/` |
| `npm run preview` | serve the build |

## Deploy to Vercel
Import the repo in Vercel; it detects Vite automatically (build `npm run build`, output `dist`). Set
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `ANTHROPIC_API_KEY` in Project Settings → Environment
Variables, and add the production URL to Supabase's Auth redirect URLs: see section 8 of
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Never add the Supabase secret/service key.
