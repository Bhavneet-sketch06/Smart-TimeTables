# Accounts and shared data with Supabase

Smart TimeTables uses Supabase for **email/password sign-in** and for the **shared college database**. Every
permission is enforced inside the database (Row Level Security, triggers and checked functions); the app only
shows what the database returns. Nothing in this guide needs a Supabase secret/service key, and the app never
uses one.

Nothing here has been applied to your hosted project: review the SQL, then follow the steps yourself.

## 1. What gets created

| File | What it does |
|---|---|
| `supabase/migrations/20261025120000_profiles_and_roles.sql` | `profiles` table (role + scope per Auth user), pending profile for every new user, `private` helper functions |
| `supabase/migrations/20261025120100_college_data.sql` | College tables (settings, departments, room types, rooms, subjects, teachers, teacher limits, sections, timetable, bookings, requests), indexes, constraints, grants and RLS policies |
| `supabase/migrations/20261025120200_guards_and_functions.sql` | Guard triggers, free/busy functions, `save_college` and `decide_request` |
| `supabase/manual/first_admin.sql` | One-time first-administrator bootstrap (run by hand, not a migration) |
| `supabase/tests/rls.test.js` | Runs the migrations in an in-process Postgres (PGlite) and checks every rule as each role (`npm test`) |

### Roles and what each one can see

| | Administrator | HOD / Coordinator | Faculty | Student |
|---|---|---|---|---|
| Scope (from `profiles`) | whole college | one department | one faculty identity + department | one department, semester, section |
| College catalogue (time, departments, rooms, subjects, teacher names, sections) | read + write | read | read | read |
| Teachers' limits and unavailability | all | own department's teachers | own | – |
| Timetable classes | all | own department | own department + own classes elsewhere | own section only |
| Other departments | – | free/busy per section (no subject, teacher or room) | – | – |
| Room availability | full detail | busy times only | busy times only | busy times only |
| Bookings | all; book any room | own department's; book own department's rooms | own; book own department's rooms | – |
| Space requests | review and decide all | own department's staff requests | own | own |
| User accounts | assign roles, turn access off | own profile (read only) | own profile (read only) | own profile (read only) |

- Role and scope live only in `public.profiles`. Users can read their own row but can't change it: only an active
  administrator can (RLS + column grants + the `guard_profile` trigger). Auth user metadata is never used.
- A new Auth user gets a **pending** profile with no access. Pending and turned-off accounts receive no college data
  at all (every policy requires an active role).
- Booking creator, department and organizer, and the requester of a space request, are filled in from the profile
  by triggers, so the browser can't claim to be someone else. Staff can only cancel and requesters can only withdraw.
- Faculty and HODs can book only their own department's rooms directly; shared and other departments' rooms need a
  request that an administrator confirms (same rule as the Campus Guide).
- Two confirmed bookings can never overlap in the same room (an exclusion constraint, setup/cleanup included). The
  check of a booking against **regular classes** runs in the app just before saving, using the shared timetable's
  free/busy data.
- Writing college data (setup, timetable, demo data, imports) is administrator-only, in one transaction per save
  (`save_college`).

## 2. Local setup

1. Install dependencies: `npm install`
2. Environment variables. If you don't have `.env.local` yet, copy `.env.example` to `.env.local`. If you already
   have one (for example with `ANTHROPIC_API_KEY`), **add** these two lines to it instead of replacing it:
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   ```
   Fill in the Project URL and the **publishable** key (Dashboard → Project Settings → API, or the "Connect" dialog).
   Never put the secret / `service_role` key in any `VITE_` variable or anywhere in this repository. `.env.local` is
   git-ignored.
3. Restart `npm run dev` (Vite reads env files at start-up) and open http://localhost:5173.

Without the two Supabase values, `npm run dev` runs the old **browser-only demo** (role picker, data in this
browser, no accounts). A production build without them shows "Sign-in isn't set up yet" instead, unless you set
`VITE_LOCAL_DEMO=true` on purpose.

## 3. Apply the migrations (manually)

Read the three migration files first. Then either:

- **SQL Editor**: Dashboard → SQL Editor → paste and run each file **in order** (`…120000`, `…120100`, `…120200`).
- **Supabase CLI**: `supabase link --project-ref <your-project-ref>` then `supabase db push` (applies everything in
  `supabase/migrations` that the project hasn't run yet).

The migrations enable the `btree_gist` extension (in the `extensions` schema), create a `private` schema for helper
functions (not exposed through the API), and revoke the default `anon` access on every new table and function.

## 4. Auth settings (Dashboard → Authentication)

- **Sign-ups**: keep "Allow new users to sign up" **off** (you have done this). The app has no sign-up form.
- **URL Configuration**:
  - Site URL: `http://localhost:5173` while developing (your production URL later, see section 8).
  - Redirect URLs: add `http://localhost:5173/**` (and later your production URL with `/**`).
  Invitation and password-reset emails link back here; the app then asks the user to choose a password.
- **Email**: Supabase's built-in email service is rate-limited and meant for testing. For real use, set up custom
  SMTP (Authentication → Emails → SMTP settings).

## 5. Create the first administrator (one time)

1. Dashboard → Authentication → Users → **Invite user** → your email. Open the invitation email, follow the link,
   and choose a password in the app. You'll see "Ask your administrator for access" (correct: nobody is admin yet).
2. Open `supabase/manual/first_admin.sql`, replace `REPLACE_WITH_ADMIN_EMAIL` with that email (or set
   `target_user_id` to the user's UID from the Users list), and run it in the SQL Editor. Don't commit the edited copy.
   It refuses to run if the placeholder is unchanged, if the user doesn't exist, or if an active administrator
   already exists. It never promotes "whoever signs in first".
3. In the app, press **Check again** (or sign out and in). You now have the Administrator workspace.

If every administrator is ever lost, an owner of the Supabase project can restore one by editing the `profiles`
row in the Table Editor or SQL Editor (the guard only applies to requests made from the app).

## 6. Invite and assign users

1. Dashboard → Authentication → Users → **Invite user** (one email per person).
2. They open the email link and choose a password. Until you assign them, they see "Ask your administrator for
   access" and no college data.
3. In the app: **Administrator → Users** → "Waiting for access". Choose the role and its scope:
   - HOD / Coordinator: department
   - Faculty: department + faculty name (each faculty name can belong to one active account)
   - Student: department + section (+ semester, filled from the section)
   Then **Save access** (access turns on with the role). The database checks that the department, faculty member
   and section exist and match.
4. To remove access, untick **Access on** and save (or set the role to "No access"). To delete someone completely,
   delete the user in the Dashboard; their profile goes with it.

Department, faculty and section choices come from the college data, so load or import the college before assigning
non-admin roles.

## 7. College data

As administrator, in **Setup**:
- **Load GNDEC demo** / **Load demo college**: replaces the shared college data (including bookings and requests)
  with the demo. The GNDEC CSE department comes from public GNDEC documents; ECE, Mechanical and Civil are labelled
  as sample departments with made-up data, and generated timetables are marked "not an official GNDEC timetable".
- **Import college data**: same CSV/Excel import as before; it now saves to the shared database.
- Setup edits save automatically (header shows "Saving…" / "Saved" / "Not saved – Retry"). Editing any input
  clears the shared timetable, as before; generate again afterwards.

### Moving data saved in a browser before accounts

If the administrator's browser still holds data from the browser-only version (`ttgen:v1` in localStorage), Setup
shows "This browser has college data from before sign-in". **Copy to the shared database** shows a preview (counts in
this browser vs. the database), asks for confirmation, copies everything in one transaction (setup and timetable
replace the database's; bookings and requests are added, existing ones kept), then **re-reads the database and
verifies** every record. Only after a verified copy can you choose **Remove the browser copy**; nothing is deleted
automatically. Open the app on the same browser and the same address (for example `http://localhost:5173`) where the
data was created, since browser storage is per address.

## 8. Production (Vercel) — when you decide to deploy

Nothing has been deployed. When you do:
1. Vercel → Project → Settings → Environment Variables (Production, and Preview if you use it):
   - `VITE_SUPABASE_URL` – the Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` – the publishable key
   - `ANTHROPIC_API_KEY` – for the AI assistant (server-side only; no `VITE_` prefix)
   Do not add the Supabase secret / service key. Redeploy after changing variables (Vite bakes `VITE_` values into
   the build).
2. Supabase → Authentication → URL Configuration: set **Site URL** to your production URL (e.g.
   `https://your-app.vercel.app`) and add `https://your-app.vercel.app/**` to Redirect URLs. Keep the localhost entry
   if you still develop locally. For Vercel preview deployments, add their URL pattern too, or test sign-in only on
   production.
3. The AI assistant (`api/chat.js`) then answers only requests carrying a valid session of an account with active
   access; it reads the same public URL/publishable key and lets the database verify the token.

## 9. Checks

- `npm test` runs every app test plus `supabase/tests/rls.test.js`, which applies the migrations to an in-process
  Postgres and checks, as each role, what can be read and written (no network, no hosted project).
- `npm run build` must pass before committing.

## 10. Known limits

- One Supabase project holds one college.
- Setup edits from two administrators at the same moment: the last save of each list wins.
- Every active account can read the college catalogue (department, room, subject and section lists and teacher
  names; not teachers' limits or unavailability). Detailed schedules, bookings and requests are scoped as above.
- A booking's check against regular classes runs in the app (with full free/busy data) right before saving; the
  database itself guarantees no overlapping bookings and that the user may book that room.
- No server function is needed: invitations are sent from the Dashboard and roles are assigned through
  RLS-protected updates.
