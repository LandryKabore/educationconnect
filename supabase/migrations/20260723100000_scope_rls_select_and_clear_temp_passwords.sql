-- CRITICAL follow-up to 20260722120000 — SELECT was still cross-tenant.
--
-- The previous migration scoped WRITE policies with ef_school_admin_of_*,
-- but several SELECT policies still call bare ef_is_school_admin(), which
-- matches ANY school_admin of ANY school. That lets school_admin A READ
-- notes, attendance, enrollments, teaching assignments, parent links and
-- class programmes of school B via the REST API.
--
-- This migration replaces those bare calls with the scoped helpers.
-- Teacher / student / parent access paths are unchanged.

-- Inscriptions
drop policy if exists ef_inscriptions_select on public.inscriptions;
create policy ef_inscriptions_select on public.inscriptions
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1
      from public.liens_parent_eleve l
      where l.parent_id = auth.uid()
        and l.student_id = inscriptions.student_id
    )
  );

-- Affectations
drop policy if exists ef_aff_select on public.affectations_enseignement;
create policy ef_aff_select on public.affectations_enseignement
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

-- Programme classe
drop policy if exists ef_programme_select on public.programme_classe;
create policy ef_programme_select on public.programme_classe
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or exists (
      select 1
      from public.classes c
      where c.id = programme_classe.class_section_id
        and c.school_id in (select public.ef_user_school_ids())
    )
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

-- Parent links
drop policy if exists ef_liens_select on public.liens_parent_eleve;
create policy ef_liens_select on public.liens_parent_eleve
  for select to authenticated
  using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_student(student_id)
    or public.ef_user_teaches_student(student_id)
  );

-- Notes
drop policy if exists ef_notes_select on public.notes;
create policy ef_notes_select on public.notes
  for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = notes.student_id
    )
  );

-- Présences
drop policy if exists ef_presences_select on public.presences;
create policy ef_presences_select on public.presences
  for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = presences.student_id
    )
  );

-- Clear temporary password hints once the forced change is acknowledged
-- (extends 20260722130000). Service-role resets can still set a new hint.
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

  -- Wipe any leftover temporary password stored in clear text.
  update public.identifiants_temporaires
  set temp_password_hint = null, used = true
  where user_id = _uid;
end;
$$;
