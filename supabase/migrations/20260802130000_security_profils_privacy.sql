-- Security hardening 4/6: profile privacy and column protection.
--
-- F-06  school admin could UPDATE any user's profile (any school).
-- F-14 / student-parent B3 / T-16
--       every member of a school could read every other member's profile
--       (email, phone, date of birth, address, matricule).
-- F-20 / student-parent B9 / T-12
--       users could update any column of their own profile (matricule,
--       active, email, must_change_password ...).
--
-- Row visibility now follows "who legitimately needs to see this person"
-- (ef_can_view_profile).  Column-level redaction for those allowed viewers is
-- NOT done here (PostgREST selects profils(*) in many pages): see
-- proposed-fixes.md, "not covered".

drop policy if exists ef_profils_select on public.profils;
drop policy if exists ef_profils_update_self on public.profils;

create policy ef_profils_select on public.profils
  for select to authenticated
  using (
    id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_user(id)
    or public.ef_can_view_profile(id)
  );

-- Updates: only your own row (the client never edits someone else's profile;
-- admin-side changes go through service-role edge functions).
create policy ef_profils_update_self on public.profils
  for update to authenticated
  using (id = auth.uid() or public.ef_is_super_admin())
  with check (id = auth.uid() or public.ef_is_super_admin());

-- Column guard for self-service edits.
create or replace function public.ef_guard_profils_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service role / SQL editor: auth.uid() is null -> unrestricted
  if auth.uid() is null or public.ef_is_super_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.email is distinct from old.email
     or new.matricule is distinct from old.matricule
     or new.active is distinct from old.active then
    raise exception 'Modification non autorisée de ce champ du profil'
      using errcode = '42501';
  end if;

  -- The client only ever clears the flag (after a successful password
  -- change); setting it back to true is an admin action.
  if old.must_change_password is false and new.must_change_password is true then
    raise exception 'Modification non autorisée de ce champ du profil'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profils_guard_self_update on public.profils;
create trigger trg_profils_guard_self_update
  before update on public.profils
  for each row execute function public.ef_guard_profils_self_update();
