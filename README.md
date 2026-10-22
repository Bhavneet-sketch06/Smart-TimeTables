# College Timetable Generator

Generate clash-free weekly timetables for any college, entirely in the browser. No backend, no login: data is saved in your browser's localStorage.

## Try it
```bash
npm install
npm run dev
```
Open http://localhost:5173 → **Administrator** → **Load GNDEC CSE (real data)** or **Load demo college** → go to **Sections** → **Generate timetable**.

Use the ☀️ / 🌙 / 💻 switch for light, dark or system theme.

## GNDEC Ludhiana data
`src/data/gndecCse.js` models the CSE department's B.Tech 3rd and 5th semesters (sections A–F each, 354 classes a week)
from public documents on cse.gndec.ac.in: the July–Dec 2026 subject allotment, the published timetable's structure
(08:30–17:30, lunch 12:30–13:30, labs in half-groups A1/A2) and the room/lab infrastructure lists. It generates in
well under a second with zero clashes. It is a realistic sample, **not** the official GNDEC timetable.

Every timetable has a **Print** button that prints just the timetable on one A4 landscape page.

## AI timetable assistant
The **Ask AI** button (bottom-right of every app screen) answers questions about the current timetable, e.g.
"When is D3 CS A free on Wednesday?". It calls `api/chat.js`, which uses Claude (`claude-opus-5-5`) on the server so
the API key is never sent to the browser.

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY=...` (get a key at https://console.anthropic.com).
2. Restart `npm run dev`.
3. On Vercel: Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY`, then redeploy.

## Roles
- **Administrator**: 5-step setup wizard (time structure → rooms → subjects → teachers → sections), then generate and review.
- **HOD / Coordinator**: timetables by section, teacher or room, filtered by department, with clash count and quality score.
- **Faculty**: pick your name (and optionally a year/class such as D2 or D3) to see your weekly schedule and load.
- **Student**: pick department and section to see a read-only, mobile-friendly timetable.

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
| `npm test` | scheduler tests (Vitest) |
| `npm run build` | production build to `dist/` |
| `npm run preview` | serve the build |

## Deploy to Vercel
Import the repo in Vercel; it detects Vite automatically (build `npm run build`, output `dist`). No environment variables or config needed.
