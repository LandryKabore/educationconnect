-- CRITICAL security fix — cross-tenant isolation.
--
-- `ef_is_school_admin()` called WITHOUT an argument matches ANY active
-- school_admin role for ANY school (see its definition in
-- 20260715140000_edufaso_initial.sql: `_school_id is null` short-circuits
-- the check to true). Every policy below called it bare, which means a
-- school_admin of School A currently passes these policies for School B's
-- rows too: a malicious/compromised school_admin account could read or
-- write another school's profiles, enrollments, teaching assignments,
-- parent links, grades, attendance, timetable, temporary passwords, and
-- delete another school's classes/subjects/academic years — via direct
-- REST/RPC calls, even though the UI never exposes cross-school data.
--
-- This migration scopes every one of those checks to the specific
-- school/class/student the row actually belongs to. It does not change
-- any legitimate same-school behavior.
--
-- ⚠️ NOT auto-applied: review, then run via `supabase db push` (or the
-- Supabase dashboard SQL editor) during a low-traffic window, since it
-- redefines RLS policies on tables with live traffic.

-- ---------------------------------------------------------------------
-- 1. New SECURITY DEFINER helpers scoped to the row's owning school.
-- ---------------------------------------------------------------------

create or replace function public.ef_school_admin_of_class(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = _class_id
      and public.ef_is_school_admin(c.school_id)
  );
$$;

create or replace function public.ef_school_admin_of_student(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inscriptions i
    where i.student_id = _student_id
      and i.status = 'active'
      and public.ef_school_admin_of_class(i.class_section_id)
  );
$$;

-- A school_admin may act on a profile only if that person holds (or held)
-- an active role in one of the schools this admin administers. Covers
-- teachers, students, parents and fellow admins of the same school.
create or replace function public.ef_school_admin_of_profile(_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles_utilisateurs ru
    where ru.user_id = _profile_id
      and ru.active = true
      and ru.school_id is not null
      and public.ef_is_school_admin(ru.school_id)
  );
$$;

revoke all on function public.ef_school_admin_of_class(uuid) from public;
revoke all on function public.ef_school_admin_of_student(uuid) from public;
revoke all on function public.ef_school_admin_of_profile(uuid) from public;
grant execute on function public.ef_school_admin_of_class(uuid) to authenticated;
grant execute on function public.ef_school_admin_of_student(uuid) to authenticated;
grant execute on function public.ef_school_admin_of_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Profiles — an admin can only see/edit people tied to their school(s).
-- ---------------------------------------------------------------------

drop policy if exists ef_profils_select on public.profils;
create policy ef_profils_select on public.profils for select to authenticated
  using (
    id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_profile(id)
  );

drop policy if exists ef_profils_update_self on public.profils;
create policy ef_profils_update_self on public.profils for update to authenticated
  using (
    id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_profile(id)
  )
  with check (
    id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_profile(id)
  );

-- ---------------------------------------------------------------------
-- 3. Enrollments / teaching assignments / parent links — scope writes.
-- ---------------------------------------------------------------------

drop policy if exists ef_inscriptions_admin on public.inscriptions;
create policy ef_inscriptions_admin on public.inscriptions for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id));

drop policy if exists ef_aff_admin on public.affectations_enseignement;
create policy ef_aff_admin on public.affectations_enseignement for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id));

drop policy if exists ef_liens_admin on public.liens_parent_eleve;
create policy ef_liens_admin on public.liens_parent_eleve for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_student(student_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_student(student_id));

-- ---------------------------------------------------------------------
-- 4. Notes / présences / évaluations / compositions — scope admin writes.
-- ---------------------------------------------------------------------

drop policy if exists ef_notes_write on public.notes;
create policy ef_notes_write on public.notes for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  );

drop policy if exists ef_presences_write on public.presences;
create policy ef_presences_write on public.presences for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  );

drop policy if exists ef_evaluations_select on public.evaluations;
create policy ef_evaluations_select on public.evaluations for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_evaluations_write on public.evaluations;
create policy ef_evaluations_write on public.evaluations for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
  );

drop policy if exists ef_composition_sessions_select on public.composition_sessions;
create policy ef_composition_sessions_select on public.composition_sessions
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_composition_sessions_write on public.composition_sessions;
create policy ef_composition_sessions_write on public.composition_sessions
  for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id));

-- ---------------------------------------------------------------------
-- 5. Timetable — stop leaking every school's schedule to every user.
-- ---------------------------------------------------------------------

drop policy if exists ef_edt_select on public.creneaux_edt;
create policy ef_edt_select on public.creneaux_edt for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_school_admin_of_class(class_section_id)
    or teacher_id = auth.uid()
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_edt_admin on public.creneaux_edt;
create policy ef_edt_admin on public.creneaux_edt for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_class(class_section_id));

-- ---------------------------------------------------------------------
-- 6. Temporary passwords — must never leak across schools.
-- ---------------------------------------------------------------------

drop policy if exists ef_temp_admin on public.identifiants_temporaires;
create policy ef_temp_admin on public.identifiants_temporaires for all to authenticated
  using (public.ef_is_super_admin() or public.ef_school_admin_of_profile(user_id))
  with check (public.ef_is_super_admin() or public.ef_school_admin_of_profile(user_id));

-- ---------------------------------------------------------------------
-- 7. Classes / matières / années scolaires — a single `for all` policy
-- let ANY member of the school (teacher, student, parent) satisfy the
-- USING clause via `school_id in (select ef_user_school_ids())`, which
-- also governs DELETE (Postgres never applies WITH CHECK to DELETE).
-- Split into a broad SELECT and an admin-only write policy.
-- ---------------------------------------------------------------------

drop policy if exists ef_annees_all on public.annees_scolaires;
create policy ef_annees_select on public.annees_scolaires for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_annees_write on public.annees_scolaires for insert to authenticated
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_annees_update on public.annees_scolaires for update to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_annees_delete on public.annees_scolaires for delete to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

drop policy if exists ef_classes_all on public.classes;
create policy ef_classes_select on public.classes for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_classes_write on public.classes for insert to authenticated
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_classes_update on public.classes for update to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_classes_delete on public.classes for delete to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

drop policy if exists ef_matieres_all on public.matieres;
create policy ef_matieres_select on public.matieres for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin(school_id)
    or school_id in (select public.ef_user_school_ids())
  );
create policy ef_matieres_write on public.matieres for insert to authenticated
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_matieres_update on public.matieres for update to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_matieres_delete on public.matieres for delete to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
