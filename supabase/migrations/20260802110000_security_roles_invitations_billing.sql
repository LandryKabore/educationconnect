-- Security hardening 2/6: privilege escalation, invitations, billing.
--
-- B-01 / F-02  school admin could INSERT/UPDATE roles_utilisateurs rows with
--              role = 'super_admin' (or school_id NULL) and become super admin.
-- B-02 / F-03  school admin could INSERT invitations with role = 'super_admin'.
-- F-13         school admins could read invitation tokens (incl. platform ones).
-- B-04 / F-12  school admin could edit plan / billing_status /
--              subscription_ends_at / active on their own school.
-- F-19         every school member could read the whole role roster.
-- B-25         audit_logs could be modified/deleted by grants.
--
-- No client code writes roles_utilisateurs or invitations as a school admin
-- (all such writes are done by service-role edge functions, which bypass RLS,
-- or by the super admin console), so write access becomes super-admin-only.

-- ---------------------------------------------------------------- roles ----
drop policy if exists ef_roles_admin_all on public.roles_utilisateurs;
drop policy if exists ef_roles_select on public.roles_utilisateurs;
drop policy if exists ef_roles_super_all on public.roles_utilisateurs;

create policy ef_roles_super_all on public.roles_utilisateurs
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

-- Read: own rows; super admin; a school admin sees roles of their own school
-- only (never platform/null-school rows, never super_admin rows); other
-- members only see the staff (school_admin / teacher) rows of their school
-- (needed for messaging contacts) - not the student/parent roster.
create policy ef_roles_select on public.roles_utilisateurs
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.ef_is_super_admin()
    or (
      school_id is not null
      and role <> 'super_admin'
      and public.ef_is_school_admin(school_id)
    )
    or (
      school_id is not null
      and role in ('school_admin', 'teacher')
      and school_id in (select public.ef_user_school_ids())
    )
  );

-- Defence in depth: even if a policy is later loosened, nobody but a
-- service-role / SQL caller (auth.uid() is null) may create, modify or
-- activate a super_admin row.
create or replace function public.ef_guard_roles_super_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ef_is_super_admin() then
    if new.role = 'super_admin' or (tg_op = 'UPDATE' and old.role = 'super_admin') then
      raise exception 'Seul un super administrateur peut gérer ce rôle'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_roles_guard_super_admin on public.roles_utilisateurs;
create trigger trg_roles_guard_super_admin
  before insert or update on public.roles_utilisateurs
  for each row execute function public.ef_guard_roles_super_admin();

-- ---------------------------------------------------------- invitations ----
drop policy if exists ef_invitations_admin on public.invitations;
drop policy if exists ef_invitations_super on public.invitations;

create policy ef_invitations_super on public.invitations
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

-- ----------------------------------------------------------- ecoles/billing
create or replace function public.ef_guard_ecoles_billing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role / SQL-editor callers: allowed.
  if auth.uid() is not null and not public.ef_is_super_admin() then
    if new.plan is distinct from old.plan
       or new.billing_status is distinct from old.billing_status
       or new.subscription_ends_at is distinct from old.subscription_ends_at
       or new.active is distinct from old.active
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'Seul le super administrateur peut modifier l''abonnement ou l''état de l''école'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ecoles_guard_billing on public.ecoles;
create trigger trg_ecoles_guard_billing
  before update on public.ecoles
  for each row execute function public.ef_guard_ecoles_billing();

-- ---------------------------------------------------------- audit_logs ----
-- Audit rows are append-only for everyone except the service role.
revoke update, delete, truncate on public.audit_logs from authenticated, anon;
