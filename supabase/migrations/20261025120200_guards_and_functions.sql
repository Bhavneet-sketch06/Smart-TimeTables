-- Smart TimeTables · 3/3 · Guard triggers, free/busy functions and administrator write functions.
--
-- Triggers make the trusted fields of profiles, bookings and requests come from the database, not the browser:
--   profiles  only administrators change them; nobody removes their own administrator access; a scope must exist
--   bookings  the creator, role and (for staff) department/organizer are taken from the creator's profile;
--             non-administrators can only cancel
--   requests  the requester (name, role, section, department) is taken from the profile; non-administrators can
--             only withdraw their own pending request
-- Free/busy functions return when a room, section or booked time is busy, never whose class or booking it is.

-- ---------- profiles ----------

create function private.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
begin
  new.user_id := old.user_id;
  new.email := old.email;
  new.created_at := old.created_at;
  new.updated_at := now();

  -- Requests from the app carry a user; the SQL editor (first-administrator bootstrap) does not.
  if caller is not null then
    if not private.is_admin() then
      raise exception 'Only administrators can change access.' using errcode = '42501';
    end if;
    new.updated_by := caller;
    if old.user_id = caller and (new.role <> 'admin' or not new.active) then
      raise exception 'You cannot remove your own administrator access. Ask another administrator to do it.' using errcode = '42501';
    end if;
  end if;

  -- Drop scope a role does not use, so a role change never leaves stale access behind.
  if new.role in ('pending', 'admin') then new.dept_id := null; end if;
  if new.role <> 'faculty' then new.teacher_id := null; end if;
  if new.role <> 'student' then new.section_id := null; new.semester := null; end if;
  if new.role = 'pending' then new.active := false; end if;

  if new.active and (not old.active or new.role is distinct from old.role or new.dept_id is distinct from old.dept_id
      or new.teacher_id is distinct from old.teacher_id or new.section_id is distinct from old.section_id) then
    if new.dept_id is not null and not exists (select 1 from public.departments where id = new.dept_id) then
      raise exception 'That department does not exist.';
    end if;
    if new.teacher_id is not null and not exists (select 1 from public.teachers where id = new.teacher_id) then
      raise exception 'That faculty member does not exist.';
    end if;
    if new.section_id is not null
       and not exists (select 1 from public.sections where id = new.section_id and dept_id = new.dept_id) then
      raise exception 'That section does not exist in the chosen department.';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile before update on public.profiles
  for each row execute function private.guard_profile();

-- ---------- bookings ----------

create function private.booking_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  dept_short text;
  teacher_name text;
begin
  new.created_by := caller;
  new.created_at := now();
  if caller is null or private.is_admin() then
    return new;   -- administrators (and the SQL editor) may record any booking, e.g. demo or imported data
  end if;

  select * into me from public.profiles where user_id = caller and active and role in ('hod', 'faculty');
  if not found then
    raise exception 'Your account cannot book rooms.' using errcode = '42501';
  end if;
  select data->>'short' into dept_short from public.departments where id = me.dept_id;
  new.data := (new.data - 'cancelledAt') || jsonb_build_object(
    'status', 'confirmed',
    'deptId', me.dept_id,
    'department', coalesce(dept_short, ''),
    'createdAt', now(),
    'createdBy', jsonb_strip_nulls(jsonb_build_object('role', me.role, 'teacherId', me.teacher_id, 'deptId', me.dept_id)));
  if me.role = 'faculty' then
    select data->>'name' into teacher_name from public.teachers where id = me.teacher_id;
    new.data := new.data || jsonb_build_object('organizerId', me.teacher_id, 'organizerName', coalesce(teacher_name, new.data->>'organizerName'));
  end if;
  return new;
end $$;

create trigger booking_before_insert before insert on public.bookings
  for each row execute function private.booking_before_insert();

create function private.booking_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if (select auth.uid()) is not null and not private.is_admin() then
    if not (old.data->>'status' = 'confirmed' and new.data->>'status' = 'cancelled'
            and (new.data - 'status' - 'cancelledAt') = (old.data - 'status' - 'cancelledAt')) then
      raise exception 'You can only cancel this booking.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger booking_before_update before update on public.bookings
  for each row execute function private.booking_before_update();

-- ---------- space requests ----------

create function private.request_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
  dept_short text;
  who text;
begin
  new.created_at := now();
  if caller is null or private.is_admin() then
    if caller is not null then new.user_id := null; end if;   -- demo/imported requests belong to no account
    return new;
  end if;

  select * into me from public.profiles where user_id = caller and active and role in ('hod', 'faculty', 'student');
  if not found then
    raise exception 'Your account cannot request rooms.' using errcode = '42501';
  end if;
  select data->>'short' into dept_short from public.departments where id = me.dept_id;
  who := coalesce(
    case when me.role = 'faculty' then (select data->>'name' from public.teachers where id = me.teacher_id) end,
    nullif(me.display_name, ''),
    me.email);
  new.user_id := caller;
  new.data := (new.data - 'decidedAt' - 'decisionNote' - 'bookingId') || jsonb_build_object(
    'status', 'pending',
    'deptId', me.dept_id,
    'department', coalesce(dept_short, ''),
    'createdAt', now(),
    'requester', jsonb_strip_nulls(jsonb_build_object(
      'role', me.role, 'name', who, 'clientId', caller::text,
      'teacherId', me.teacher_id, 'sectionId', me.section_id, 'deptId', me.dept_id)));
  return new;
end $$;

create trigger request_before_insert before insert on public.requests
  for each row execute function private.request_before_insert();

create function private.request_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if (select auth.uid()) is not null and not private.is_admin() then
    if not (old.data->>'status' = 'pending' and new.data->>'status' = 'withdrawn'
            and (new.data - 'status' - 'decidedAt') = (old.data - 'status' - 'decidedAt')) then
      raise exception 'You can only withdraw a request that is still awaiting approval.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger request_before_update before update on public.requests
  for each row execute function private.request_before_update();

-- ---------- free/busy (no details) ----------

-- Periods each room is taken by a regular class, for room searches by any active account.
create function public.room_busy()
returns table (room_id text, day integer, period integer, length integer)
language sql stable security definer set search_path = '' as $$
  select distinct e.room_id, e.day, e.period, e.length
  from public.timetable_entries e
  where (select private.is_active()) and e.room_id is not null
$$;

-- Periods each section has a class, for HODs finding joint free times with other departments.
create function public.section_busy()
returns table (section_id text, day integer, period integer, length integer)
language sql stable security definer set search_path = '' as $$
  select distinct e.section_id, e.day, e.period, e.length
  from public.timetable_entries e
  where (select private.my_role()) in ('admin', 'hod')
$$;

-- Times rooms are held by confirmed bookings from a date on, without titles, organisers or departments.
create function public.booking_holds(p_from date)
returns table (room_id text, date text, start text, duration integer, setup integer, cleanup integer)
language sql stable security definer set search_path = '' as $$
  select b.room_id, b.data->>'date', b.data->>'start', (b.data->>'duration')::int,
         coalesce((b.data->>'setup')::int, 0), coalesce((b.data->>'cleanup')::int, 0)
  from public.bookings b
  where (select private.is_active()) and b.status = 'confirmed' and b.booking_date >= p_from
$$;

-- When the timetable was last generated (students cannot read the summary itself).
create function public.timetable_generated_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select m.generated_at from public.timetable_meta m where (select private.is_active())
$$;

-- ---------- administrator writes ----------

-- Replaces one catalogue table with a list of app objects, keeping their order. Runs as the caller (RLS applies).
create function private.replace_rows(tbl text, rows jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if tbl not in ('departments', 'room_types', 'rooms', 'subjects', 'teachers', 'sections') then
    raise exception 'Unknown table %', tbl;
  end if;
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception '% must be a list', tbl;
  end if;
  execute format(
    'delete from public.%I where id not in (select x->>''id'' from jsonb_array_elements($1) x where x->>''id'' is not null)',
    tbl) using rows;
  execute format(
    'insert into public.%1$I (id, data, sort)
       select x->>''id'', x, (o - 1)::int from jsonb_array_elements($1) with ordinality a(x, o)
     on conflict (id) do update set data = excluded.data, sort = excluded.sort, updated_at = now()
       where public.%1$I.data is distinct from excluded.data or public.%1$I.sort is distinct from excluded.sort',
    tbl) using rows;
end $$;

revoke all on function private.replace_rows(text, jsonb) from public, anon;
grant execute on function private.replace_rows(text, jsonb) to authenticated;

/*
 * Saves college data in one transaction. Every key is optional; a present key replaces that part:
 *   time, meta                         college settings
 *   departments, roomTypes, rooms, subjects, teachers, sections   catalogue lists (app objects)
 *   timetable                          null clears it; { ...summary, entries } replaces it
 *   bookings, requests                 replace every booking / request (loading a demo, clearing all)
 *   addBookings, addRequests           add these, skipping ids that already exist (demo items, browser import)
 * Administrators only: the check below gives a clear message, and RLS enforces it on every statement.
 */
create function public.save_college(p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  teachers jsonb;
begin
  if not private.is_admin() then
    raise exception 'Only administrators can change college data.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Nothing to save.';
  end if;

  if p ? 'time' or p ? 'meta' then
    insert into public.college_settings as s (id, time, meta)
    values (true, coalesce(p->'time', '{}'::jsonb), nullif(p->'meta', 'null'::jsonb))
    on conflict (id) do update set
      time = case when p ? 'time' then excluded.time else s.time end,
      meta = case when p ? 'meta' then excluded.meta else s.meta end,
      updated_at = now();
  end if;

  if p ? 'departments' then perform private.replace_rows('departments', p->'departments'); end if;
  if p ? 'roomTypes' then perform private.replace_rows('room_types', p->'roomTypes'); end if;
  if p ? 'rooms' then perform private.replace_rows('rooms', p->'rooms'); end if;
  if p ? 'subjects' then perform private.replace_rows('subjects', p->'subjects'); end if;
  if p ? 'sections' then perform private.replace_rows('sections', p->'sections'); end if;
  if p ? 'teachers' then
    teachers := p->'teachers';
    if jsonb_typeof(teachers) <> 'array' then raise exception 'teachers must be a list'; end if;
    perform private.replace_rows('teachers', (
      select coalesce(jsonb_agg(x - 'maxHours' - 'maxPerDay' - 'unavailable' order by o), '[]'::jsonb)
      from jsonb_array_elements(teachers) with ordinality a(x, o)));
    insert into public.teacher_private as tp (teacher_id, data)
    select x->>'id', jsonb_strip_nulls(jsonb_build_object(
             'maxHours', x->'maxHours', 'maxPerDay', x->'maxPerDay', 'unavailable', x->'unavailable'))
    from jsonb_array_elements(teachers) x
    on conflict (teacher_id) do update set data = excluded.data, updated_at = now()
      where tp.data is distinct from excluded.data;
  end if;

  if p ? 'timetable' then
    delete from public.timetable_entries where true;
    delete from public.timetable_meta where true;
    if jsonb_typeof(p->'timetable') = 'object' then
      insert into public.timetable_meta (id, data, generated_at)
      values (true, (p->'timetable') - 'entries',
              coalesce((p->'timetable'->>'generatedAt')::timestamptz, now()));
      insert into public.timetable_entries (data, dept_id)
      select x, s.dept_id
      from jsonb_array_elements(coalesce(p->'timetable'->'entries', '[]'::jsonb)) x
      left join public.sections s on s.id = x->>'sectionId';
    end if;
  end if;

  if p ? 'bookings' then
    delete from public.bookings where true;
    insert into public.bookings (id, data) select x->>'id', x from jsonb_array_elements(p->'bookings') x;
  end if;
  if p ? 'addBookings' then
    insert into public.bookings (id, data) select x->>'id', x from jsonb_array_elements(p->'addBookings') x
    on conflict (id) do nothing;
  end if;
  if p ? 'requests' then
    delete from public.requests where true;
    insert into public.requests (id, data) select x->>'id', x from jsonb_array_elements(p->'requests') x;
  end if;
  if p ? 'addRequests' then
    insert into public.requests (id, data) select x->>'id', x from jsonb_array_elements(p->'addRequests') x
    on conflict (id) do nothing;
  end if;
end $$;

/*
 * Confirms (as `p_booking`, already re-checked against classes in the app) or declines a pending request in one
 * transaction. The bookings_no_overlap constraint still rejects a room taken meanwhile. Administrators only.
 */
create function public.decide_request(p_id text, p_decision text, p_note text default '', p_booking jsonb default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r public.requests;
begin
  if not private.is_admin() then
    raise exception 'Only administrators can decide requests.' using errcode = '42501';
  end if;
  select * into r from public.requests where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'This request was already decided.';
  end if;
  if p_decision = 'decline' then
    update public.requests
    set data = data || jsonb_build_object('status', 'declined', 'decidedAt', now(), 'decisionNote', coalesce(p_note, ''))
    where id = p_id;
  elsif p_decision = 'approve' then
    if p_booking is null or p_booking->>'id' is null then
      raise exception 'A booking is needed to confirm a request.';
    end if;
    insert into public.bookings (id, data) values (p_booking->>'id', p_booking);
    update public.requests
    set data = data || jsonb_build_object('status', 'approved', 'decidedAt', now(), 'decisionNote', coalesce(p_note, ''),
                                          'bookingId', p_booking->>'id', 'roomId', p_booking->>'roomId')
    where id = p_id;
  else
    raise exception 'Unknown decision %', p_decision;
  end if;
end $$;

-- Functions in public are callable through the API: signed-in accounts only (each checks the caller itself).
revoke all on function public.room_busy(), public.section_busy(), public.booking_holds(date),
  public.timetable_generated_at(), public.save_college(jsonb), public.decide_request(text, text, text, jsonb)
  from public, anon;
grant execute on function public.room_busy(), public.section_busy(), public.booking_holds(date),
  public.timetable_generated_at(), public.save_college(jsonb), public.decide_request(text, text, text, jsonb)
  to authenticated;

revoke all on function private.guard_profile(), private.booking_before_insert(), private.booking_before_update(),
  private.request_before_insert(), private.request_before_update(), private.handle_new_user(),
  private.handle_user_email() from public, anon, authenticated;
