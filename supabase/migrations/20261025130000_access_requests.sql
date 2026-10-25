-- Smart TimeTables · 4 · Access requests: a new user proposes their role and scope; an administrator approves.
--
-- A pending user may say who they are (HOD of a department, a faculty member, or a student of a section) through
-- request_access(). That only fills the requested_* columns of their own pending profile: it grants nothing. The
-- account stays without access until an administrator approves (copies the request into role/scope and turns access
-- on) or declines it. Administrator access can never be requested.
--
-- Apply after migrations 1-3 (SQL Editor or `supabase db push`). Safe to run once; it changes no existing data.

alter table public.profiles
  add column requested_role       text check (requested_role is null or requested_role in ('hod', 'faculty', 'student')),
  add column requested_dept_id    text,
  add column requested_teacher_id text,
  add column requested_section_id text,
  add column requested_semester   text check (requested_semester is null or length(requested_semester) <= 60),
  add column requested_note       text check (requested_note is null or length(requested_note) <= 300),
  add column requested_at         timestamptz,
  add column request_declined_at  timestamptz;

-- Administrators decline (clear) requests with a normal update; RLS still allows profile updates to admins only.
grant update (requested_role, requested_dept_id, requested_teacher_id, requested_section_id, requested_semester,
  requested_note, requested_at, request_declined_at) on table public.profiles to authenticated;

-- Same rules as before, plus: a non-administrator (only ever through request_access) may change nothing but the
-- request columns of their own pending profile, and turning access on settles the request.
create or replace function private.guard_profile() returns trigger
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
      if old.user_id <> caller or old.role <> 'pending'
         or (new.role, new.active, new.dept_id, new.teacher_id, new.section_id, new.semester, new.display_name, new.updated_by)
            is distinct from
            (old.role, old.active, old.dept_id, old.teacher_id, old.section_id, old.semester, old.display_name, old.updated_by) then
        raise exception 'Only administrators can change access.' using errcode = '42501';
      end if;
      return new;
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

  -- Giving access settles any open request.
  if new.active and not old.active then
    new.requested_role := null;
    new.requested_dept_id := null;
    new.requested_teacher_id := null;
    new.requested_section_id := null;
    new.requested_semester := null;
    new.requested_note := null;
    new.requested_at := null;
    new.request_declined_at := null;
  end if;

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

-- What a pending user may choose from: department, faculty and section names only (no timetable, no limits).
-- Faculty names that already belong to an active account are left out. Everyone else gets null.
create function public.access_options() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'pending') then
    jsonb_build_object(
      'departments', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'short', d.data->>'short', 'name', d.data->>'name') order by d.sort)
        from public.departments d), '[]'::jsonb),
      'teachers', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.data->>'name', 'deptId', t.dept_id) order by t.data->>'name')
        from public.teachers t
        where not exists (select 1 from public.profiles p where p.role = 'faculty' and p.active and p.teacher_id = t.id)), '[]'::jsonb),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.data->>'name', 'deptId', s.dept_id, 'batch', coalesce(s.data->>'batch', '')) order by s.sort)
        from public.sections s), '[]'::jsonb))
  end
$$;

-- Records (or replaces) the caller's own access request. Grants nothing by itself.
create function public.request_access(
  p_role text, p_dept_id text, p_teacher_id text default null, p_section_id text default null,
  p_semester text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  me public.profiles;
begin
  if caller is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into me from public.profiles where user_id = caller;
  if not found or me.role <> 'pending' then
    raise exception 'Your access is managed by an administrator.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('hod', 'faculty', 'student') then
    raise exception 'Choose HOD / Coordinator, Faculty or Student.';
  end if;
  if p_dept_id is null or not exists (select 1 from public.departments where id = p_dept_id) then
    raise exception 'Choose your department.';
  end if;
  if p_role = 'faculty' then
    if p_teacher_id is null or not exists (select 1 from public.teachers where id = p_teacher_id) then
      raise exception 'Choose your name from the faculty list.';
    end if;
    if exists (select 1 from public.profiles where role = 'faculty' and active and teacher_id = p_teacher_id) then
      raise exception 'That faculty member already has an account. Ask your administrator.';
    end if;
  end if;
  if p_role = 'student' then
    if p_section_id is null or not exists (select 1 from public.sections where id = p_section_id and dept_id = p_dept_id) then
      raise exception 'Choose your section.';
    end if;
    if coalesce(trim(p_semester), '') = '' then
      raise exception 'Enter your semester.';
    end if;
  end if;

  update public.profiles set
    requested_role = p_role,
    requested_dept_id = p_dept_id,
    requested_teacher_id = case when p_role = 'faculty' then p_teacher_id end,
    requested_section_id = case when p_role = 'student' then p_section_id end,
    requested_semester = case when p_role = 'student' then left(trim(p_semester), 60) end,
    requested_note = nullif(left(trim(coalesce(p_note, '')), 300), ''),
    requested_at = now(),
    request_declined_at = null
  where user_id = caller;
end $$;

revoke all on function public.access_options(), public.request_access(text, text, text, text, text, text) from public, anon;
grant execute on function public.access_options(), public.request_access(text, text, text, text, text, text) to authenticated;
