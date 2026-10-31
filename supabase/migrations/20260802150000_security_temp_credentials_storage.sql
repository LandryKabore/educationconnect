-- Security hardening 6/6: temporary credentials, avatar storage, fail-closed
-- ef_is_school_admin().
--
-- F-04 / student-parent B1  identifiants_temporaires (plaintext temp passwords)
--                           was readable/writable by ANY school admin.
-- B-14                      stale hint after a super-admin reset.
-- F-11 / T-13               avatars bucket: anonymous listing and any school
--                           admin could write into any user's folder.
-- F-01 (safety net)         ef_is_school_admin() with no school argument must
--                           never again mean "admin of some school".

-- ------------------------------------------------ identifiants_temporaires -
drop policy if exists ef_temp_admin on public.identifiants_temporaires;
drop policy if exists ef_temp_super on public.identifiants_temporaires;
drop policy if exists ef_temp_school_admin_select on public.identifiants_temporaires;

create policy ef_temp_super on public.identifiants_temporaires
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

-- School admins can read (never write; edge functions use the service role)
-- the credentials of users of their own school.
create policy ef_temp_school_admin_select on public.identifiants_temporaires
  for select to authenticated
  using (public.ef_is_school_admin_of_user(user_id));

-- A temp password must stop existing once it has been used (or replaced).
create or replace function public.ef_clear_used_temp_hint()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.used is true then
    new.temp_password_hint := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_temp_clear_used_hint on public.identifiants_temporaires;
create trigger trg_temp_clear_used_hint
  before insert or update on public.identifiants_temporaires
  for each row execute function public.ef_clear_used_temp_hint();

-- The existing "password changed" trigger now also wipes the hint directly.
create or replace function public.ef_mark_temp_credential_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.must_change_password is true and new.must_change_password is false then
    update public.identifiants_temporaires
      set used = true,
          temp_password_hint = null
      where user_id = new.id;
  end if;
  return new;
end;
$$;

-- Backfill: wipe hints that are already used, or whose owner already changed
-- their password.  (Hints of accounts that never logged in are kept: the
-- school admin still needs to hand them over.)
update public.identifiants_temporaires t
set used = true, temp_password_hint = null
where t.temp_password_hint is not null
  and (
    t.used is true
    or exists (
      select 1 from public.profils p
      where p.id = t.user_id and p.must_change_password is false
    )
  );

-- ----------------------------------------------------------- avatars bucket
-- Public URLs (…/object/public/avatars/<uid>/avatar.jpg, used by the app) do
-- not go through storage.objects policies, so removing the anonymous SELECT
-- policy only removes listing / authenticated-API enumeration.
drop policy if exists ef_avatars_select on storage.objects;
drop policy if exists ef_avatars_insert on storage.objects;
drop policy if exists ef_avatars_update on storage.objects;
drop policy if exists ef_avatars_delete on storage.objects;

create policy ef_avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.ef_is_school_admin_of_user(public.ef_try_uuid((storage.foldername(name))[1]))
    )
  );

create policy ef_avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.ef_is_school_admin_of_user(public.ef_try_uuid((storage.foldername(name))[1]))
    )
  );

create policy ef_avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.ef_is_school_admin_of_user(public.ef_try_uuid((storage.foldername(name))[1]))
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.ef_is_school_admin_of_user(public.ef_try_uuid((storage.foldername(name))[1]))
    )
  );

create policy ef_avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.ef_is_school_admin_of_user(public.ef_try_uuid((storage.foldername(name))[1]))
    )
  );

-- ------------------------------------------- fail-closed ef_is_school_admin
-- Same signature (so existing policies/functions keep working); a NULL school
-- now means "no school" -> false, instead of "any school".  All repo policies
-- are scoped by the previous migrations; this is the safety net for anything
-- that was missed or exists only in the live database.
create or replace function public.ef_is_school_admin(_school_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _school_id is not null and exists (
    select 1 from public.roles_utilisateurs
    where user_id = auth.uid()
      and role = 'school_admin'
      and active = true
      and school_id = _school_id
  );
$$;
