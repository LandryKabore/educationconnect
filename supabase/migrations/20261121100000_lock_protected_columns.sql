-- Lock the columns that row-level security alone left open (security review, 21 Nov 2026).
-- Applied to production (hbfjtsxzueftoiryzhxh) on 21 Nov 2026.
--
-- The UPDATE policies on ecoles, profils and messages decide WHICH rows a person may update,
-- not WHICH columns, so a signed-in user calling the API directly could:
--   * as a school admin, set their own school's plan, billing status, subscription end or active flag;
--   * clear their own must_change_password (skipping the forced change after a temporary
--     password) or change their own e-mail, matricule, active or family_managed;
--   * rewrite a message they sent or received (subject, body, sender, recipient…).
--
-- These BEFORE UPDATE triggers put the protected columns back to their old value for ordinary
-- signed-in callers. They never raise, so the apps' own writes keep working unchanged.
-- Super admins, edge functions (service role) and the auth server (no auth.uid()) are not limited.

-- Schools: a school admin edits the school's details, never its subscription.
create or replace function public.ef_guard_ecoles_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.ef_is_super_admin() then
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.active := old.active;
  new.plan := old.plan;
  new.billing_status := old.billing_status;
  new.subscription_ends_at := old.subscription_ends_at;
  new.student_accounts_from := old.student_accounts_from;
  return new;
end $$;

drop trigger if exists ef_guard_ecoles_update on public.ecoles;
create trigger ef_guard_ecoles_update before update on public.ecoles
  for each row execute function public.ef_guard_ecoles_update();

-- Profiles: a person edits their own personal details only
-- (names, phone, sex, birth date, address, photo, last login).
create or replace function public.ef_guard_profils_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.ef_is_super_admin() then
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.email := old.email;
  new.matricule := old.matricule;
  new.active := old.active;
  new.family_managed := old.family_managed;
  new.must_change_password := old.must_change_password;
  return new;
end $$;

drop trigger if exists ef_guard_profils_update on public.profils;
create trigger ef_guard_profils_update before update on public.profils
  for each row execute function public.ef_guard_profils_update();

-- The forced password change is cleared by the auth server itself when the password really
-- changes (the apps' own « must_change_password: false » write is now ignored by the guard above).
-- Edge functions that set a temporary password update the profile right after, setting it back to true.
create or replace function public.ef_clear_must_change_password()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profils set must_change_password = false
     where id = new.id and must_change_password;
  end if;
  return new;
end $$;

revoke all on function public.ef_clear_must_change_password() from public, anon, authenticated;

drop trigger if exists ef_clear_must_change_password on auth.users;
create trigger ef_clear_must_change_password after update of encrypted_password on auth.users
  for each row execute function public.ef_clear_must_change_password();

-- Messages: nobody rewrites a message; only its recipient marks it read.
create or replace function public.ef_guard_messages_update()
returns trigger language plpgsql set search_path = public as $$
declare
  read_at_new timestamptz := new.read_at;
begin
  if auth.uid() is null or public.ef_is_super_admin() then
    return new;
  end if;
  new := old;
  if auth.uid() = old.recipient_id then
    new.read_at := read_at_new;
  end if;
  return new;
end $$;

drop trigger if exists ef_guard_messages_update on public.messages;
create trigger ef_guard_messages_update before update on public.messages
  for each row execute function public.ef_guard_messages_update();
