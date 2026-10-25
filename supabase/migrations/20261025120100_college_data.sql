-- Smart TimeTables · 2/3 · College data shared by every signed-in user, with Row Level Security.
--
-- Each record keeps the app's own object in `data` (the shape documented in CLAUDE.md / src/data/schema.js), so
-- timetable, import, department, lab-group, room and booking behaviour is unchanged. The columns that policies
-- depend on (department, teacher, section, room, status) are generated from `data` or set by triggers, never
-- trusted from the browser separately. One Supabase project holds one college.
--
-- Who can read what:
--   college catalogue (settings, departments, room types, rooms, subjects, teachers' names, sections)
--                                   every active account
--   teachers' limits/unavailability administrators; HOD for their department's teachers; faculty for themselves
--   timetable entries               administrators all; HOD their department; faculty their department + own classes;
--                                   students their own section only
--   bookings                        administrators all; HOD their department; faculty their own
--   space requests                  administrators all; the requester; HOD their department's staff requests
-- Free/busy without details (rooms, sections, booked times) comes from the functions in migration 3.
-- Every write to the catalogue and the timetable is administrator-only.

create extension if not exists btree_gist with schema extensions;

-- ---------- catalogue ----------

create table public.college_settings (
  id         boolean primary key default true check (id),   -- a single row
  time       jsonb not null check (jsonb_typeof(time) = 'object'),
  meta       jsonb check (meta is null or jsonb_typeof(meta) in ('object', 'null')),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.room_types (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  dept_id    text generated always as (nullif(data->>'deptId', '')) stored,   -- home department (null = shared)
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  dept_id    text generated always as (nullif(data->>'deptId', '')) stored,
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Public part of a teacher (name, department, subjects). Limits and unavailability are in teacher_private.
create table public.teachers (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (
               jsonb_typeof(data) = 'object' and data->>'id' = id
               and not (data ? 'maxHours' or data ? 'maxPerDay' or data ? 'unavailable')),
  dept_id    text generated always as (nullif(data->>'deptId', '')) stored,
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.teacher_private (
  teacher_id text primary key references public.teachers (id) on delete cascade,
  data       jsonb not null check (jsonb_typeof(data) = 'object'),   -- { maxHours, maxPerDay?, unavailable }
  updated_at timestamptz not null default now()
);

create table public.sections (
  id         text primary key check (length(id) between 1 and 100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  dept_id    text generated always as (nullif(data->>'deptId', '')) stored,
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);

create index rooms_dept_idx on public.rooms (dept_id);
create index subjects_dept_idx on public.subjects (dept_id);
create index teachers_dept_idx on public.teachers (dept_id);
create index sections_dept_idx on public.sections (dept_id);

-- ---------- generated timetable ----------

create table public.timetable_meta (
  id           boolean primary key default true check (id),
  data         jsonb not null check (jsonb_typeof(data) = 'object'),   -- stats, byDept, generatedAt, reason, ...
  generated_at timestamptz not null default now()
);

create table public.timetable_entries (
  id         bigint generated always as identity primary key,
  -- { sectionId, subjectId, teacherId, roomId, day, period, length, kind, group?, groupIndex? }
  data       jsonb not null check (
               jsonb_typeof(data) = 'object'
               and jsonb_typeof(data->'day') = 'number' and jsonb_typeof(data->'period') = 'number'
               and jsonb_typeof(data->'length') = 'number'),
  section_id text generated always as (data->>'sectionId') stored not null,
  teacher_id text generated always as (data->>'teacherId') stored,
  room_id    text generated always as (data->>'roomId') stored,
  day        integer generated always as ((data->>'day')::integer) stored,
  period     integer generated always as ((data->>'period')::integer) stored,
  length     integer generated always as ((data->>'length')::integer) stored,
  dept_id    text   -- the section's department, set by save_college()
);

create index timetable_entries_dept_idx on public.timetable_entries (dept_id);
create index timetable_entries_section_idx on public.timetable_entries (section_id);
create index timetable_entries_teacher_idx on public.timetable_entries (teacher_id);
create index timetable_entries_room_idx on public.timetable_entries (room_id, day);

-- ---------- bookings and space requests ----------

-- "YYYY-MM-DD" + "HH:MM" -> timestamp, without the session-dependent text casts (so it can be IMMUTABLE).
create function private.local_ts(d text, t text) returns timestamp
language sql immutable set search_path = '' as $$
  select make_timestamp(substr(d, 1, 4)::int, substr(d, 6, 2)::int, substr(d, 9, 2)::int,
                        substr(t, 1, 2)::int, substr(t, 4, 2)::int, 0)
$$;

-- The whole interval a booking holds its room for: setup before, the event, cleanup after.
create function private.booking_span(d jsonb) returns tsrange
language sql immutable set search_path = '' as $$
  select tsrange(
    private.local_ts(d->>'date', d->>'start') - make_interval(mins => coalesce((d->>'setup')::int, 0)),
    private.local_ts(d->>'date', d->>'start') + make_interval(mins => (d->>'duration')::int + coalesce((d->>'cleanup')::int, 0)),
    '[)')
$$;

create function private.iso_date(d text) returns date
language sql immutable set search_path = '' as $$
  select make_date(substr(d, 1, 4)::int, substr(d, 6, 2)::int, substr(d, 9, 2)::int)
$$;

grant execute on function private.local_ts(text, text), private.booking_span(jsonb), private.iso_date(text) to authenticated;

create table public.bookings (
  id                   text primary key check (length(id) between 1 and 100),
  data                 jsonb not null check (
                         jsonb_typeof(data) = 'object' and data->>'id' = id
                         and data->>'status' in ('confirmed', 'cancelled')
                         and data->>'roomId' is not null
                         and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'start' ~ '^\d{2}:\d{2}$'
                         and jsonb_typeof(data->'duration') = 'number' and (data->>'duration')::numeric > 0),
  status               text generated always as (data->>'status') stored,
  room_id              text generated always as (data->>'roomId') stored,
  dept_id              text generated always as (nullif(data->>'deptId', '')) stored,
  organizer_teacher_id text generated always as (nullif(coalesce(data->>'organizerId', data#>>'{createdBy,teacherId}'), '')) stored,
  booking_date         date generated always as (private.iso_date(data->>'date')) stored,
  span                 tsrange generated always as (private.booking_span(data)) stored,
  created_by           uuid,   -- the account that made it (set by trigger)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Two confirmed bookings can never hold the same room at overlapping times (setup and cleanup included),
  -- whichever department or browser they come from.
  constraint bookings_no_overlap exclude using gist (room_id extensions.gist_text_ops with =, span with &&) where (status = 'confirmed')
);

create index bookings_dept_idx on public.bookings (dept_id);
create index bookings_organizer_idx on public.bookings (organizer_teacher_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_date_idx on public.bookings (booking_date);

create table public.requests (
  id             text primary key check (length(id) between 1 and 100),
  data           jsonb not null check (
                   jsonb_typeof(data) = 'object' and data->>'id' = id
                   and data->>'status' in ('pending', 'approved', 'declined', 'withdrawn')
                   and data->>'roomId' is not null
                   and data->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and data->>'start' ~ '^\d{2}:\d{2}$'
                   and jsonb_typeof(data->'duration') = 'number' and (data->>'duration')::numeric > 0),
  status         text generated always as (data->>'status') stored,
  room_id        text generated always as (data->>'roomId') stored,
  dept_id        text generated always as (nullif(data->>'deptId', '')) stored,
  requester_role text generated always as (data#>>'{requester,role}') stored,
  user_id        uuid references auth.users (id) on delete set null,   -- the requester's account (set by trigger)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index requests_user_idx on public.requests (user_id);
create index requests_dept_idx on public.requests (dept_id, status);

-- ---------- grants ----------

revoke all on table public.college_settings, public.departments, public.room_types, public.rooms, public.subjects,
  public.teachers, public.teacher_private, public.sections, public.timetable_meta, public.timetable_entries,
  public.bookings, public.requests from anon, authenticated;

grant select, insert, update, delete on table public.college_settings, public.departments, public.room_types,
  public.rooms, public.subjects, public.teachers, public.teacher_private, public.sections, public.timetable_meta,
  public.timetable_entries to authenticated;
grant select, insert, update, delete on table public.bookings, public.requests to authenticated;

-- ---------- RLS: catalogue ----------

alter table public.college_settings enable row level security;
alter table public.departments enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.subjects enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_private enable row level security;
alter table public.sections enable row level security;
alter table public.timetable_meta enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.bookings enable row level security;
alter table public.requests enable row level security;

create policy "settings: active accounts read" on public.college_settings for select to authenticated using ((select private.is_active()));
create policy "settings: administrators write" on public.college_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "departments: active accounts read" on public.departments for select to authenticated using ((select private.is_active()));
create policy "departments: administrators write" on public.departments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "room types: active accounts read" on public.room_types for select to authenticated using ((select private.is_active()));
create policy "room types: administrators write" on public.room_types for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "rooms: active accounts read" on public.rooms for select to authenticated using ((select private.is_active()));
create policy "rooms: administrators write" on public.rooms for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "subjects: active accounts read" on public.subjects for select to authenticated using ((select private.is_active()));
create policy "subjects: administrators write" on public.subjects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "teachers: active accounts read" on public.teachers for select to authenticated using ((select private.is_active()));
create policy "teachers: administrators write" on public.teachers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "teacher limits: administrators, own HOD, the teacher" on public.teacher_private for select to authenticated using (
  (select private.is_admin())
  or ((select private.my_role()) = 'faculty' and teacher_id = (select private.my_teacher()))
  or ((select private.my_role()) = 'hod'
      and exists (select 1 from public.teachers t where t.id = teacher_id and t.dept_id = (select private.my_dept())))
);
create policy "teacher limits: administrators write" on public.teacher_private for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "sections: active accounts read" on public.sections for select to authenticated using ((select private.is_active()));
create policy "sections: administrators write" on public.sections for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------- RLS: timetable ----------

create policy "timetable summary: staff read" on public.timetable_meta for select to authenticated
  using ((select private.my_role()) in ('admin', 'hod', 'faculty'));
create policy "timetable summary: administrators write" on public.timetable_meta for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "timetable: scoped read" on public.timetable_entries for select to authenticated using (
  (select private.is_admin())
  or ((select private.my_role()) = 'hod' and dept_id = (select private.my_dept()))
  or ((select private.my_role()) = 'faculty'
      and (dept_id = (select private.my_dept()) or teacher_id = (select private.my_teacher())))
  or ((select private.my_role()) = 'student' and section_id = (select private.my_section()))
);
create policy "timetable: administrators write" on public.timetable_entries for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------- RLS: bookings ----------
-- Faculty and HODs book their own department's rooms directly; shared and other departments' rooms need a
-- request that an administrator confirms (same rule as needsApproval() in src/campusGuide.js).

create policy "bookings: scoped read" on public.bookings for select to authenticated using (
  (select private.is_admin())
  or ((select private.my_role()) = 'hod' and dept_id = (select private.my_dept()))
  or ((select private.my_role()) = 'faculty'
      and (organizer_teacher_id = (select private.my_teacher()) or created_by = (select auth.uid())))
);

create policy "bookings: administrators book any room" on public.bookings for insert to authenticated
  with check ((select private.is_admin()));

create policy "bookings: staff book their department's rooms" on public.bookings for insert to authenticated with check (
  (select private.my_role()) in ('hod', 'faculty')
  and status = 'confirmed'
  and created_by = (select auth.uid())
  and dept_id = (select private.my_dept())
  and exists (select 1 from public.rooms r where r.id = room_id and r.dept_id = (select private.my_dept()))
  and ((select private.my_role()) = 'hod' or organizer_teacher_id = (select private.my_teacher()))
);

create policy "bookings: cancel within scope" on public.bookings for update to authenticated using (
  (select private.is_admin())
  or ((select private.my_role()) = 'hod' and dept_id = (select private.my_dept()))
  or ((select private.my_role()) = 'faculty'
      and (organizer_teacher_id = (select private.my_teacher()) or created_by = (select auth.uid())))
) with check (
  (select private.is_admin())
  or ((select private.my_role()) = 'hod' and dept_id = (select private.my_dept()))
  or ((select private.my_role()) = 'faculty'
      and (organizer_teacher_id = (select private.my_teacher()) or created_by = (select auth.uid())))
);

create policy "bookings: administrators delete" on public.bookings for delete to authenticated
  using ((select private.is_admin()));

-- ---------- RLS: space requests ----------

create policy "requests: scoped read" on public.requests for select to authenticated using (
  (select private.is_admin())
  or user_id = (select auth.uid())
  or ((select private.my_role()) = 'hod' and dept_id = (select private.my_dept()) and requester_role <> 'student')
);

create policy "requests: active accounts ask" on public.requests for insert to authenticated with check (
  (select private.is_admin())
  or ((select private.is_active()) and user_id = (select auth.uid()) and status = 'pending')
);

create policy "requests: requester or administrator updates" on public.requests for update to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()))
  with check ((select private.is_admin()) or user_id = (select auth.uid()));

create policy "requests: administrators delete" on public.requests for delete to authenticated
  using ((select private.is_admin()));
