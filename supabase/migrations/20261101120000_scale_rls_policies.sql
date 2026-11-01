-- Scale pack 3/4: same access rules, evaluated once per query instead of once per row.
--
-- Every rewrite below is mechanical and keeps the rule identical:
--   ef_is_super_admin()                       ->  (select ef_is_super_admin())        (one InitPlan per query)
--   auth.uid()                                ->  (select auth.uid())
--   ef_is_school_admin(school_id)             ->  school_id in (select ef_my_admin_school_ids())
--   ef_is_school_admin_of_class(class_id)     ->  class_id in (select ef_my_admin_class_ids())
--   ef_is_school_admin_of_user(user_id)       ->  user_id in (select ef_my_admin_user_ids())
--   ef_user_teaches_class(class_id)           ->  class_id in (select ef_my_taught_class_ids())
--   ef_user_teaches_class_subject(c, s)       ->  (c, s) in (select * from ef_my_teaching_pairs())
--   ef_user_enrolled_in_class(class_id)       ->  class_id in (select ef_my_enrolled_class_ids())
--   ef_user_parent_of_student_in_class(c)     ->  c in (select ef_my_parent_class_ids())
--   exists(liens ... parent = me, student = row) -> student_id in (select ef_my_child_ids())
--   ef_user_teaches_student(student_id)       ->  student_id in (select ef_my_taught_student_ids())
--   ef_can_view_profile(id)                   ->  id in (select ef_my_visible_profile_ids())
-- Row helpers that only run on the few rows being WRITTEN (ef_student_in_class,
-- ef_subject_in_class_school, ef_user_in_school) are kept as they were.
-- No policy is added, dropped or renamed; the trigger guards are untouched.
-- ALTER POLICY is transactional: there is never a moment without protection.
-- Rollback: rollback/20261101120000_scale_rls_policies.down.sql (exact previous text).

-- affectations_enseignement
alter policy ef_aff_admin on public.affectations_enseignement
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_is_school_admin_of_user(teacher_id)
    and public.ef_subject_in_class_school(class_section_id, subject_id)));
alter policy ef_aff_select on public.affectations_enseignement
  using (teacher_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or class_section_id in (select public.ef_my_enrolled_class_ids())
    or class_section_id in (select public.ef_my_parent_class_ids()));

-- annees_scolaires
alter policy ef_annees_select on public.annees_scolaires
  using ((select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
    or school_id in (select public.ef_user_school_ids()));
alter policy ef_annees_write on public.annees_scolaires
  using ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()))
  with check ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()));

-- audit_logs
alter policy ef_audit_logs_super_insert on public.audit_logs
  with check ((select public.ef_is_super_admin()) and actor_id = (select auth.uid()));
alter policy ef_audit_logs_super_select on public.audit_logs
  using ((select public.ef_is_super_admin()));

-- classes
alter policy ef_classes_select on public.classes
  using ((select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
    or school_id in (select public.ef_user_school_ids()));
alter policy ef_classes_write on public.classes
  using ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()))
  with check ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()));

-- composition_sessions
alter policy ef_composition_sessions_select on public.composition_sessions
  using ((select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or class_section_id in (select public.ef_my_enrolled_class_ids())
    or class_section_id in (select public.ef_my_parent_class_ids()));
alter policy ef_composition_sessions_write on public.composition_sessions
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()));

-- creneaux_edt
alter policy ef_edt_admin on public.creneaux_edt
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_is_school_admin_of_user(teacher_id)
    and public.ef_subject_in_class_school(class_section_id, subject_id)));
alter policy ef_edt_select on public.creneaux_edt
  using (teacher_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or class_section_id in (select public.ef_my_enrolled_class_ids())
    or class_section_id in (select public.ef_my_parent_class_ids()));

-- ecoles
alter policy ef_ecoles_school_admin_update on public.ecoles
  using (id in (select public.ef_my_admin_school_ids()))
  with check (id in (select public.ef_my_admin_school_ids()));
alter policy ef_ecoles_select on public.ecoles
  using ((select public.ef_is_super_admin()) or id in (select public.ef_user_school_ids()));
alter policy ef_ecoles_super on public.ecoles
  using ((select public.ef_is_super_admin()))
  with check ((select public.ef_is_super_admin()));

-- evaluations
alter policy ef_evaluations_select on public.evaluations
  using (teacher_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or (admin_confirmed = true and (
         class_section_id in (select public.ef_my_enrolled_class_ids())
         or class_section_id in (select public.ef_my_parent_class_ids()))));
alter policy ef_evaluations_write_admin on public.evaluations
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_subject_in_class_school(class_section_id, subject_id)));
alter policy ef_evaluations_write_teacher on public.evaluations
  using (teacher_id = (select auth.uid()) and type <> 'composition'
    and (class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p))
  with check (teacher_id = (select auth.uid()) and type <> 'composition'
    and (class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p));

-- identifiants_temporaires
alter policy ef_temp_school_admin_select on public.identifiants_temporaires
  using (user_id in (select public.ef_my_admin_user_ids()));
alter policy ef_temp_super on public.identifiants_temporaires
  using ((select public.ef_is_super_admin()))
  with check ((select public.ef_is_super_admin()));

-- inscriptions
alter policy ef_inscriptions_admin on public.inscriptions
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_is_school_admin_of_user(student_id)));
alter policy ef_inscriptions_select on public.inscriptions
  using (student_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or student_id in (select public.ef_my_child_ids()));

-- invitations
alter policy ef_invitations_super on public.invitations
  using ((select public.ef_is_super_admin()))
  with check ((select public.ef_is_super_admin()));

-- liens_parent_eleve
alter policy ef_liens_admin on public.liens_parent_eleve
  using ((select public.ef_is_super_admin()) or student_id in (select public.ef_my_admin_user_ids()))
  with check ((select public.ef_is_super_admin()) or (
    public.ef_is_school_admin_of_user(student_id) and public.ef_is_school_admin_of_user(parent_id)));
alter policy ef_liens_select on public.liens_parent_eleve
  using (parent_id = (select auth.uid())
    or student_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or student_id in (select public.ef_my_admin_user_ids())
    or student_id in (select public.ef_my_taught_student_ids()));

-- matieres
alter policy ef_matieres_select on public.matieres
  using ((select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
    or school_id in (select public.ef_user_school_ids()));
alter policy ef_matieres_write on public.matieres
  using ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()))
  with check ((select public.ef_is_super_admin()) or school_id in (select public.ef_my_admin_school_ids()));

-- messages
alter policy ef_messages_insert on public.messages
  with check (sender_id = (select auth.uid())
    and ((select public.ef_is_super_admin())
      or (public.ef_user_in_school((select auth.uid()), school_id)
          and public.ef_user_in_school(recipient_id, school_id))));
alter policy ef_messages_select on public.messages
  using (sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids()));
alter policy ef_messages_update on public.messages
  using (recipient_id = (select auth.uid()) or sender_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()) or sender_id = (select auth.uid()));

-- notes
alter policy ef_notes_select on public.notes
  using (student_id = (select auth.uid())
    or recorded_by = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or student_id in (select public.ef_my_child_ids()));
alter policy ef_notes_write_admin on public.notes
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_student_in_class(student_id, class_section_id)
    and public.ef_subject_in_class_school(class_section_id, subject_id)));
alter policy ef_notes_write_teacher on public.notes
  using ((class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p))
  with check ((class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p)
    and public.ef_student_in_class(student_id, class_section_id));

-- platform_settings
alter policy ef_platform_settings_super on public.platform_settings
  using ((select public.ef_is_super_admin()))
  with check ((select public.ef_is_super_admin()));

-- presences
alter policy ef_presences_select on public.presences
  using (student_id = (select auth.uid())
    or recorded_by = (select auth.uid())
    or (select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or student_id in (select public.ef_my_child_ids()));
alter policy ef_presences_write_admin on public.presences
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or (
    class_section_id in (select public.ef_my_admin_class_ids())
    and public.ef_student_in_class(student_id, class_section_id)
    and public.ef_subject_in_class_school(class_section_id, subject_id)));
alter policy ef_presences_write_teacher on public.presences
  using ((class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p))
  with check ((class_section_id, subject_id) in (select p.class_section_id, p.subject_id from public.ef_my_teaching_pairs() p)
    and public.ef_student_in_class(student_id, class_section_id));

-- profils
alter policy ef_profils_select on public.profils
  using (id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or id in (select public.ef_my_admin_user_ids())
    or id in (select public.ef_my_visible_profile_ids()));
alter policy ef_profils_update_self on public.profils
  using (id = (select auth.uid()) or (select public.ef_is_super_admin()))
  with check (id = (select auth.uid()) or (select public.ef_is_super_admin()));

-- programme_classe
alter policy ef_programme_admin on public.programme_classe
  using ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()))
  with check ((select public.ef_is_super_admin()) or class_section_id in (select public.ef_my_admin_class_ids()));
alter policy ef_programme_select on public.programme_classe
  using ((select public.ef_is_super_admin())
    or class_section_id in (select public.ef_my_admin_class_ids())
    or class_section_id in (select public.ef_my_school_class_ids())
    or class_section_id in (select public.ef_my_enrolled_class_ids())
    or class_section_id in (select public.ef_my_taught_class_ids())
    or class_section_id in (select public.ef_my_parent_class_ids()));

-- roles_utilisateurs
alter policy ef_roles_select on public.roles_utilisateurs
  using (user_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or (school_id is not null and role <> 'super_admin'
        and school_id in (select public.ef_my_admin_school_ids()))
    or (school_id is not null and role = any (array['school_admin'::ef_app_role, 'teacher'::ef_app_role])
        and school_id in (select public.ef_user_school_ids())));
alter policy ef_roles_super_all on public.roles_utilisateurs
  using ((select public.ef_is_super_admin()))
  with check ((select public.ef_is_super_admin()));
