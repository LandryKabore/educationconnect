-- CRITICAL security fix — forced password change bypass.
--
-- `ef_profils_update_self` lets a user UPDATE their own `profils` row for
-- ANY column, including `must_change_password`. The app only clears that
-- flag client-side (AuthContext.completePasswordChange) right after a real
-- `auth.updateUser({password})` call — but nothing stops a user from
-- calling `supabase.from('profils').update({ must_change_password: false })`
-- directly and skipping the actual password change, keeping a
-- school-assigned temporary password forever. Same gap for `active`
-- (a disabled account could try to re-enable itself).
--
-- Fix: a BEFORE UPDATE trigger snaps `must_change_password`/`active` back
-- to their previous value unless the change comes from (a) an edge
-- function using the service-role key (all legitimate admin flows), (b)
-- an admin acting through RLS-checked helpers, or (c) the new
-- `ef_complete_password_change()` RPC, which only succeeds if Supabase
-- Auth just recorded a real password change for that user.
--
-- ⚠️ NOT auto-applied — see notice in 20260722120000_scope_rls_school_admin_cross_tenant.sql.

create or replace function public.ef_complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _recently_changed boolean;
begin
  if _uid is null then
    raise exception 'Non authentifié';
  end if;

  select (updated_at > now() - interval '5 minutes')
  into _recently_changed
  from auth.users
  where id = _uid;

  if not coalesce(_recently_changed, false) then
    raise exception 'Aucun changement de mot de passe récent détecté pour cet utilisateur';
  end if;

  perform set_config('ef.allow_password_ack', 'true', true);
  update public.profils set must_change_password = false where id = _uid;
end;
$$;

revoke all on function public.ef_complete_password_change() from public;
grant execute on function public.ef_complete_password_change() to authenticated;

create or replace function public.ef_guard_profils_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Edge functions (creer-utilisateur, gerer-identifiant, support-user-action,
  -- importer-eleves, accepter-invitation, bootstrap-super-admin) call the
  -- Postgres API with the service-role key and are already authorized
  -- server-side — never block them.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.must_change_password is distinct from old.must_change_password
     and coalesce(current_setting('ef.allow_password_ack', true), '') <> 'true'
     and not public.ef_is_super_admin()
     and not public.ef_school_admin_of_profile(old.id)
  then
    new.must_change_password := old.must_change_password;
  end if;

  if new.active is distinct from old.active
     and not public.ef_is_super_admin()
     and not public.ef_school_admin_of_profile(old.id)
  then
    new.active := old.active;
  end if;

  return new;
end;
$$;

drop trigger if exists ef_profils_guard_sensitive on public.profils;
create trigger ef_profils_guard_sensitive
  before update on public.profils
  for each row execute function public.ef_guard_profils_sensitive_columns();
