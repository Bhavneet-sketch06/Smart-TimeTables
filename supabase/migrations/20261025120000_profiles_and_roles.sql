-- Smart TimeTables · 1/3 · Profiles: the trusted role and scope of every Supabase Auth user.
--
-- Role and scope live only in public.profiles, which users can read (their own row) but never change. Only an
-- active administrator can assign a role, a scope or activate an account (see migration 3 for the guard trigger).
-- Nothing here reads user-editable Auth metadata (raw_user_meta_data).
--
-- Review, then apply manually (Supabase Dashboard → SQL Editor, or `supabase db push`). See docs/SUPABASE_SETUP.md.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text check (display_name is null or length(display_name) <= 120),
  role         text not null default 'pending' check (role in ('pending', 'admin', 'hod', 'faculty', 'student')),
  dept_id      text,   -- departments.id  (HOD, faculty, student)
  teacher_id   text,   -- teachers.id     (faculty)
  section_id   text,   -- sections.id     (student)
  semester     text check (semester is null or length(semester) <= 60),   -- (student)
  active       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  -- Each role carries exactly the scope it needs; a pending account can never be active.
  constraint profiles_scope check (
    case role
      when 'pending' then not active and dept_id is null and teacher_id is null and section_id is null and semester is null
      when 'admin'   then teacher_id is null and section_id is null and semester is null
      when 'hod'     then dept_id is not null and teacher_id is null and section_id is null and semester is null
      when 'faculty' then dept_id is not null and teacher_id is not null and section_id is null and semester is null
      when 'student' then dept_id is not null and section_id is not null and semester is not null and teacher_id is null
    end
  )
);

-- One active faculty account per faculty identity.
create unique index profiles_one_account_per_teacher on public.profiles (teacher_id) where role = 'faculty' and active;
create index profiles_role_idx on public.profiles (role, active);

-- Every new Auth user (invited or created in the Dashboard) gets a pending profile with no access.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the copy of the email (shown to administrators) in step with Auth.
create function private.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email();

-- Users who already existed before this migration also start as pending.
insert into public.profiles (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

-- ---------- helpers used by every policy ----------
-- SECURITY DEFINER so policies can read the caller's profile without recursing into profiles' own RLS.
-- They only ever return the caller's own (active) scope.

create function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = (select auth.uid()) and active and role <> 'pending'
$$;

create function private.my_dept() returns text
language sql stable security definer set search_path = '' as $$
  select dept_id from public.profiles where user_id = (select auth.uid()) and active
$$;

create function private.my_teacher() returns text
language sql stable security definer set search_path = '' as $$
  select teacher_id from public.profiles where user_id = (select auth.uid()) and active and role = 'faculty'
$$;

create function private.my_section() returns text
language sql stable security definer set search_path = '' as $$
  select section_id from public.profiles where user_id = (select auth.uid()) and active and role = 'student'
$$;

create function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_role() is not null
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false)
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.my_role(), private.my_dept(), private.my_teacher(), private.my_section(),
  private.is_active(), private.is_admin() to authenticated;

-- ---------- profiles RLS ----------

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
-- Column-level: email, user_id and the audit columns can never be written from the app.
grant update (display_name, role, dept_id, teacher_id, section_id, semester, active) on table public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create policy "profiles: administrators read all" on public.profiles
  for select to authenticated using ((select private.is_admin()));

create policy "profiles: administrators assign" on public.profiles
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
-- No insert or delete policies: profiles are created by the Auth trigger and removed with the Auth user.
