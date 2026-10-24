# College Timetable Generator

Browser-only timetable generator for any college. No backend: all data lives in localStorage. Deployed as a static site on Vercel. Built as a 120-minute hackathon prototype.

## Stack
- React 18 + Vite 5, lucide-react icons
- AI assistant: `api/chat.js` (Vercel serverless function, `@anthropic-ai/sdk`, model `claude-opus-5-5`),
  served locally by a Vite dev middleware in `vite.config.js`. Key: `ANTHROPIC_API_KEY` in `.env.local` / Vercel env.
  Never expose the key to the browser (no `VITE_` prefix, never import the SDK in `src/`).
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
Vercel: framework preset "Vite", build `npm run build`, output `dist`. No `vercel.json` needed; `api/` is
deployed as serverless functions automatically. Set `ANTHROPIC_API_KEY` in Project Settings → Environment Variables.

## Folder structure
```
api/chat.js                      # assistant endpoint: validates input, streams Claude's answer as plain text
src/
  main.jsx, App.jsx, index.css   # entry, view switcher, Tailwind import
  chat/timetableContext.js       # data + timetable + bookings -> compact text for the assistant (cached)
  booking.js, booking.test.js    # PURE JS: Book a Space room checks, suggestions, demo bookings (seedBookings)
  scheduler.js                   # PURE JS: precheck, generateTimetable, findClashes, scoreQuality
  scheduler.test.js              # runs scheduler on demo data, asserts zero clashes
  diagnose.js, diagnose.test.js  # PURE JS: failure guidance (causes ranked, suggested changes, pre-check/quick-test checks)
  myDay.js, myDay.test.js        # PURE JS: a student's day (classes in time order, now/next, next teaching day)
  import/                        # PURE JS: Import College Data (no dependencies, nothing leaves the browser)
    formats.js                   # CSV parse/write, .xlsx read (zip + DecompressionStream) and minimal .xlsx write
    tables.js                    # accepted tables/columns (+ synonyms), sample college used for templates and demo
    collegeImport.js             # readUpload, detectTable/autoMap, buildImport (row-level validation, add/replace)
  data/
    schema.js                    # emptyCollege(), uid(), periodTimes(), data-shape docs
    demoCollege.js               # sample college (3 depts, 6 sections, 12 teachers, 8 rooms)
    gndecCse.js                  # real GNDEC Ludhiana CSE data (Jul-Dec 2026, 12 sections, lab groups A1/A2)
    gndecCollege.js              # GNDEC demo: real CSE + SAMPLE ECE/ME/Civil (+ EE not set up), shared rooms/teachers
    departments.js               # normalizeCollege, sectionsOf/teachersOf/subjectsOf/entriesOf, mergeDepartmentTimetable
  departments.test.js            # department scoping + cross-department generation
  hooks/useCollegeData.js        # localStorage-backed state (key `ttgen:v1`)
  hooks/usePrefs.js              # theme (light/dark/system) (key `ttgen:prefs`)
  theme-dark.css                 # GENERATED: dark theme flips Tailwind colour scales under `.dark`
  components/                    # TimetableGrid (days across, times down, legend), TimetableSheet (title + Print),
                                 # SummaryPanel, FailureGuidance, PrefsControls, ChatWidget, DepartmentBar (+ HOD picker),
                                 # DepartmentEmpty ("set up / generate this department" prompt), ui bits
  pages/
    Landing.jsx                  # role selector
    admin/                       # setup wizard: Time → Rooms → Subjects → Teachers → Sections
                                 # ImportData.jsx / ImportReview.jsx: choose files → map → validate → apply
                                 # (subjects before teachers so "can teach" has options); listUtils.js helpers
    TimetableViews.jsx           # section / teacher / room tabs + summary (Admin, HOD)
    FacultyView.jsx, StudentView.jsx  # StudentView switches between MyDay.jsx and the weekly sheet
    booking/                     # BookSpace (4-step flow + receipt), BookingsList, BookingReceipt
```

## Data model (localStorage key `ttgen:v1`)
```js
{
  meta: null | { name, note },                                   // where the data came from
  departments: [{ id, short, name, source?: "gndec" | "sample", note? }],
  time: { days: ["Mon", ...], periodsPerDay: 7, breakAfter: 4,    // break between P4 and P5
          startTime: "08:30", periodMinutes: 60, breakMinutes: 60 },
  rooms:    [{ id, name, capacity, type: "classroom" | "lab" | "seminar" }],
  teachers: [{ id, name, department, subjectIds, maxHours, unavailable: ["Mon-1", ...] }],
  subjects: [{ id, name, code, lectureHours, labHours, labSessions? }], // labHours = length of ONE lab block
  sections: [{ id, name, department, students, labGroups?, groupNames?,
               assignments: [{ subjectId, teacherId, labTeacherId? }] }],
  timetable: null | { entries, stats, generatedAt },
  bookings: [{ id, status: "confirmed" | "cancelled", eventType, title, department, organizerId?, organizerName,
               attendance, notes, facilities, roomId, date: "YYYY-MM-DD", start: "HH:MM", duration, setup, cleanup,
               createdAt, createdBy: { role, teacherId? } }],
}
```
Rooms may have `facilities: string[]` and `eventsOnly: true` (never used for classes, only bookings).

Departments: sections have `deptId` and `batch` (e.g. "3rd Sem (D2)"; the old free-text `department` is kept for
display); teachers/subjects/rooms have an optional `deptId` (home department; null = service department / shared).
`normalizeCollege` upgrades older saved data on every load. Rooms are always college-wide.
`timetable.byDept[deptId]` holds each department's last run (stats, reason, unplaced).
Timetable entry: `{ sectionId, subjectId, teacherId, roomId, day, period, length, kind: "lecture" | "lab", group?, groupIndex? }`. `day` is a 0-based index, `period` is 0-based internally.

Lab groups: a section with `labGroups: 2` takes each lab as two group units (e.g. A1, A2), each needing a lab
room for half the students; `labSessions` lab blocks per group per week. Lectures block every group; a lab
blocks only its own group, so groups can be in different labs at the same time.

## Scheduler (src/scheduler.js)
1. `precheck(data)` → `{ ok, problems }` with plain-language problems for impossible input.
2. Requirements become units: each lecture hour is a 1-period unit; each subject's labs are one unit of `labHours` consecutive periods needing a lab room.
3. Units ordered most-constrained first (labs, then fewest candidate slots).
4. Backtracking with busy grids for teacher / room / section lab-group; hard constraints: no double-booking, room capacity & type, labs consecutive and not crossing the break, teacher unavailability.
5. Candidates sorted by soft score (spread a subject across days, avoid > 3 back-to-back periods for a teacher,
   run a section's lab groups exactly side by side).
6. Step limit + random restarts + time budget (`timeLimitMs`, default 4000); on failure returns a plain-language `reason`.
   Identical units (same section/subject/kind) share a `group` and are placed in order to avoid symmetric thrashing.
7. `findClashes(entries, data)` is an independent verifier used by the UI and the test.
   Failures carry structure for `diagnose.js`: `precheck` returns `issues` ({ kind, key, message, ...facts }) next to
   `problems`, and a failed search returns `failure` (the hardest unit and what blocked each start time). Guidance
   must say what is confirmed vs likely; a suggestion is only called a fix if the pre-check or `testChange` shows it.
8. Departments: `generateTimetable(data, { departmentId, fixedEntries })` schedules one department's sections around
   other departments' existing classes (their rooms and teachers are pre-marked busy); `generateCollege` runs every
   department in turn, largest first. Units prefer their department's rooms, then shared rooms, then others'.
   `precheck(..., { departmentId, fixedEntries })` counts shared teachers' hours in other departments.
   Quality across departments is `collegeQuality` (department scores weighted by classes).

## Conventions
- `scheduler.js` must stay framework-free (no React imports) and deterministic for a given `seed` option.
- Reference entities by `id`, never by name. Ids come from `uid()` in `data/schema.js`.
- Unavailable-slot key format: `"<DayName>-<period>"` with 1-based period, e.g. `"Mon-1"`.
- Styling with Tailwind utility classes only. No `dark:` variants needed: dark mode comes from `theme-dark.css`
  (regenerate it from `node_modules/tailwindcss/theme.css` if you use a new colour hue). Use fixed hex
  arbitrary values (e.g. `bg-[#4f46e5]`) only for things that must look the same in both themes.
- Root font size is a fixed 18px (index.css); size things in rem-based utilities.
- Printing: render timetables through `TimetableSheet` and mark everything else `print:hidden`; index.css sets
  A4 landscape and a smaller root font for print, and usePrefs switches to the light theme while printing.
- Keep components small and functional; state flows from `useCollegeData` in `App.jsx` via props.
- Other localStorage keys (`ttgen:role`, `ttgen:student`, `ttgen:studentView`, `ttgen:faculty`) are per-viewer conveniences only; wrap all storage access in try/catch.
- Editing any input through `update()` clears the stored timetable (it would be stale).
- Import College Data: one table per CSV file or per .xlsx sheet (time, departments, rooms, subjects, teachers,
  sections, assignments); records refer to each other by department code, subject code, section and teacher name.
  `buildImport` never overwrites: "add" reports clashes with the current setup as errors, "replace" needs a confirm
  and keeps ids of same-named records. Any error blocks the import; the generator's precheck shows as warnings.
  Saved through `importCollege` in useCollegeData (bookings kept, timetable cleared); imported data has
  `meta.source: 'import'` and departments `source: 'import'`.
- Book a Space: bookings change only through `bookSpace` / `cancelBooking` / `addSampleBookings` in
  `useCollegeData`, which re-read the saved bookings, re-check the room and write immediately. The autosave
  effect always keeps the saved bookings (never the in-memory copy), and a `storage` listener syncs other tabs.
  Roles: Faculty books as themselves and cancels their own; HOD sees/cancels their department's; Admin all.
- Department context (App.jsx, `ttgen:dept`): Admin picks any department or "All departments"; HOD is locked to a
  demo assignment (`ttgen:hodDept`, chosen once, "Change" to re-pick); Faculty and Student pick any single
  department. Pages receive `deptId` and filter with the helpers in `data/departments.js`; never duplicate pages
  per department.
- Build in small steps; commit after each working step. Run `npm test` and `npm run build` before committing.
- `.claude/launch.json` defines the `dev` preview server (port 5173).
