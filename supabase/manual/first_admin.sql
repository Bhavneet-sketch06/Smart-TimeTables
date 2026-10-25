-- Smart TimeTables · one-time first-administrator bootstrap. NOT a migration: run it by hand, once.
--
-- 1. Apply the three migrations in supabase/migrations first.
-- 2. Invite (or create) the administrator in Supabase Dashboard → Authentication → Users.
-- 3. Replace REPLACE_WITH_ADMIN_EMAIL below with that user's email address (or set target_user_id to their
--    user UID from the Users list and leave the email placeholder as it is).
-- 4. Run this in Dashboard → SQL Editor. It refuses to run if an active administrator already exists, if the
--    placeholder was not replaced, or if no such Auth user exists. It never promotes "whoever signed in first".
-- Every later administrator is assigned in the app (Users tab) by an existing administrator.

do $$
declare
  target_email   text := 'REPLACE_WITH_ADMIN_EMAIL';
  target_user_id uuid := null;   -- optional: e.g. '00000000-0000-0000-0000-000000000000'
  found_id       uuid;
begin
  if target_user_id is null and target_email = 'REPLACE_WITH_ADMIN_EMAIL' then
    raise exception 'Set target_email (or target_user_id) to the administrator you invited, then run again.';
  end if;
  if exists (select 1 from public.profiles where role = 'admin' and active) then
    raise exception 'An active administrator already exists. Assign other administrators from the app (Users tab).';
  end if;

  if target_user_id is not null then
    select id into found_id from auth.users where id = target_user_id;
  else
    select id into found_id from auth.users where lower(email) = lower(target_email);
  end if;
  if found_id is null then
    raise exception 'No Auth user matches. Invite the user in Authentication → Users first.';
  end if;

  insert into public.profiles (user_id, email)
  select id, email from auth.users where id = found_id
  on conflict (user_id) do nothing;

  update public.profiles
  set role = 'admin', active = true, dept_id = null, teacher_id = null, section_id = null, semester = null
  where user_id = found_id;

  raise notice 'Administrator access granted to %', found_id;
end $$;
