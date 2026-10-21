# College Timetable Generator

Browser-only timetable generator for any college. No backend: all data lives in localStorage. Deployed as a static site on Vercel. Built as a 120-minute hackathon prototype.

## Stack
- React 18 + Vite 5
- Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js` / PostCSS config)
- Vitest for tests (configured in `vite.config.js`, Node environment)
- No router: `App.jsx` holds a `view` state (`landing | admin | hod | faculty | student`)

## Commands
```bash
npm install        # install deps
npm run dev        # dev server (http://localhost:5173)
npm test           # vitest run (one-shot)
npm run test:watch # vitest watch mode
npm run build      # production build to dist/
npm run preview    # serve dist/ locally
```
Vercel: framework preset "Vite", build `npm run build`, output `dist`. No `vercel.json` needed.

## Folder structure
```
src/
  main.jsx, App.jsx, index.css   # entry, view switcher, Tailwind import
  scheduler.js                   # PURE JS: precheck, generateTimetable, findClashes, scoreQuality
  scheduler.test.js              # runs scheduler on demo data, asserts zero clashes
  data/
    schema.js                    # emptyCollege(), uid(), data-shape docs
    demoCollege.js               # sample college (3 depts, 6 sections, 12 teachers, 8 rooms)
  hooks/useCollegeData.js        # localStorage-backed state (key `ttgen:v1`)
  components/                    # TimetableGrid, SummaryPanel, shared ui bits
  pages/
    Landing.jsx                  # role selector
    admin/                       # setup wizard: Time → Rooms → Teachers → Subjects → Sections
    TimetableViews.jsx           # section / teacher / room tabs + summary (Admin, HOD)
    FacultyView.jsx, StudentView.jsx
```

## Data model (localStorage key `ttgen:v1`)
```js
{
  time: { days: ["Mon", ...], periodsPerDay: 7, breakAfter: 4 }, // break between P4 and P5
  rooms:    [{ id, name, capacity, type: "classroom" | "lab" | "seminar" }],
  teachers: [{ id, name, department, subjectIds, maxHours, unavailable: ["Mon-1", ...] }],
  subjects: [{ id, name, code, lectureHours, labHours }],   // labHours = length of ONE lab block
  sections: [{ id, name, department, students, assignments: [{ subjectId, teacherId }] }],
  timetable: null | { entries, stats, generatedAt },
}
```
Timetable entry: `{ sectionId, subjectId, teacherId, roomId, day, period, length, kind: "lecture" | "lab" }`. `day` is a 0-based index, `period` is 0-based internally.

## Scheduler (src/scheduler.js)
1. `precheck(data)` → `{ ok, problems }` with plain-language problems for impossible input.
2. Requirements become units: each lecture hour is a 1-period unit; each subject's labs are one unit of `labHours` consecutive periods needing a lab room.
3. Units ordered most-constrained first (labs, then fewest candidate slots).
4. Backtracking with busy grids for teacher / room / section; hard constraints: no double-booking, room capacity & type, labs consecutive and not crossing the break, teacher unavailability.
5. Candidates sorted by soft score (spread a subject across days, avoid > 3 back-to-back periods for a teacher).
6. Step limit + random restarts; on failure returns a plain-language `reason`.
7. `findClashes(entries, data)` is an independent verifier used by the UI and the test.

## Conventions
- `scheduler.js` must stay framework-free (no React imports) and deterministic for a given `seed` option.
- Reference entities by `id`, never by name. Ids come from `uid()` in `data/schema.js`.
- Unavailable-slot key format: `"<DayName>-<period>"` with 1-based period, e.g. `"Mon-1"`.
- Styling with Tailwind utility classes only; `index.css` contains just the Tailwind import.
- Keep components small and functional; state flows from `useCollegeData` in `App.jsx` via props.
- Build in small steps; commit after each working step. Run `npm test` and `npm run build` before committing.
