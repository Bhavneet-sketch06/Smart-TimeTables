# College Timetable Generator

Generate clash-free weekly timetables for any college, entirely in the browser. No backend, no login: data is saved in your browser's localStorage.

## Try it
```bash
npm install
npm run dev
```
Open http://localhost:5173 → **Administrator** → **Load demo college** → go to **Sections** → **Generate timetable**.

## Roles
- **Administrator**: 5-step setup wizard (time structure → rooms → subjects → teachers → sections), then generate and review.
- **HOD / Coordinator**: timetables by section, teacher or room, filtered by department, with clash count and quality score.
- **Faculty**: pick your name to see your weekly schedule and load.
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
