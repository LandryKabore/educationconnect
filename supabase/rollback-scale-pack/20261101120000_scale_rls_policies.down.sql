-- Restores the exact policy text captured from live on 2026-10-31 (before the scale pack).
-- Run BEFORE 20261101110000_scale_rls_helpers.down.sql.

alter policy ef_aff_admin on public.affectations_enseignement
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_is_school_admin_of_user(teacher_id) AND ef_subject_in_class_school(class_section_id, subject_id))));

alter policy ef_aff_select on public.affectations_enseignement
  using (((teacher_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR ef_user_enrolled_in_class(class_section_id) OR ef_user_parent_of_student_in_class(class_section_id)));

alter policy ef_annees_select on public.annees_scolaires
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id) OR (school_id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids))));

alter policy ef_annees_write on public.annees_scolaires
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id)))
  with check ((ef_is_super_admin() OR ef_is_school_admin(school_id)));

alter policy ef_audit_logs_super_insert on public.audit_logs
  with check ((ef_is_super_admin() AND (actor_id = auth.uid())));

alter policy ef_audit_logs_super_select on public.audit_logs
  using (ef_is_super_admin());

alter policy ef_classes_select on public.classes
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id) OR (school_id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids))));

alter policy ef_classes_write on public.classes
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id)))
  with check ((ef_is_super_admin() OR ef_is_school_admin(school_id)));

alter policy ef_composition_sessions_select on public.composition_sessions
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR ef_user_enrolled_in_class(class_section_id) OR ef_user_parent_of_student_in_class(class_section_id)));

alter policy ef_composition_sessions_write on public.composition_sessions
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)));

alter policy ef_edt_admin on public.creneaux_edt
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_is_school_admin_of_user(teacher_id) AND ef_subject_in_class_school(class_section_id, subject_id))));

alter policy ef_edt_select on public.creneaux_edt
  using (((teacher_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR ef_user_enrolled_in_class(class_section_id) OR ef_user_parent_of_student_in_class(class_section_id)));

alter policy ef_ecoles_school_admin_update on public.ecoles
  using (ef_is_school_admin(id))
  with check (ef_is_school_admin(id));

alter policy ef_ecoles_select on public.ecoles
  using ((ef_is_super_admin() OR (id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids))));

alter policy ef_ecoles_super on public.ecoles
  using (ef_is_super_admin())
  with check (ef_is_super_admin());

alter policy ef_evaluations_select on public.evaluations
  using (((teacher_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR ((admin_confirmed = true) AND (ef_user_enrolled_in_class(class_section_id) OR ef_user_parent_of_student_in_class(class_section_id)))));

alter policy ef_evaluations_write_admin on public.evaluations
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_subject_in_class_school(class_section_id, subject_id))));

alter policy ef_evaluations_write_teacher on public.evaluations
  using (((teacher_id = auth.uid()) AND (type <> 'composition'::text) AND ef_user_teaches_class_subject(class_section_id, subject_id)))
  with check (((teacher_id = auth.uid()) AND (type <> 'composition'::text) AND ef_user_teaches_class_subject(class_section_id, subject_id)));

alter policy ef_temp_school_admin_select on public.identifiants_temporaires
  using (ef_is_school_admin_of_user(user_id));

alter policy ef_temp_super on public.identifiants_temporaires
  using (ef_is_super_admin())
  with check (ef_is_super_admin());

alter policy ef_inscriptions_admin on public.inscriptions
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_is_school_admin_of_user(student_id))));

alter policy ef_inscriptions_select on public.inscriptions
  using (((student_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR (EXISTS ( SELECT 1
   FROM liens_parent_eleve l
  WHERE ((l.parent_id = auth.uid()) AND (l.student_id = inscriptions.student_id))))));

alter policy ef_invitations_super on public.invitations
  using (ef_is_super_admin())
  with check (ef_is_super_admin());

alter policy ef_liens_admin on public.liens_parent_eleve
  using ((ef_is_super_admin() OR ef_is_school_admin_of_user(student_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_user(student_id) AND ef_is_school_admin_of_user(parent_id))));

alter policy ef_liens_select on public.liens_parent_eleve
  using (((parent_id = auth.uid()) OR (student_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_user(student_id) OR ef_user_teaches_student(student_id)));

alter policy ef_matieres_select on public.matieres
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id) OR (school_id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids))));

alter policy ef_matieres_write on public.matieres
  using ((ef_is_super_admin() OR ef_is_school_admin(school_id)))
  with check ((ef_is_super_admin() OR ef_is_school_admin(school_id)));

alter policy ef_messages_insert on public.messages
  with check (((sender_id = auth.uid()) AND (ef_is_super_admin() OR (ef_user_in_school(auth.uid(), school_id) AND ef_user_in_school(recipient_id, school_id)))));

alter policy ef_messages_select on public.messages
  using (((sender_id = auth.uid()) OR (recipient_id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin(school_id)));

alter policy ef_messages_update on public.messages
  using (((recipient_id = auth.uid()) OR (sender_id = auth.uid())))
  with check (((recipient_id = auth.uid()) OR (sender_id = auth.uid())));

alter policy ef_notes_select on public.notes
  using (((student_id = auth.uid()) OR (recorded_by = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR (EXISTS ( SELECT 1
   FROM liens_parent_eleve l
  WHERE ((l.parent_id = auth.uid()) AND (l.student_id = notes.student_id))))));

alter policy ef_notes_write_admin on public.notes
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_student_in_class(student_id, class_section_id) AND ef_subject_in_class_school(class_section_id, subject_id))));

alter policy ef_notes_write_teacher on public.notes
  using (ef_user_teaches_class_subject(class_section_id, subject_id))
  with check ((ef_user_teaches_class_subject(class_section_id, subject_id) AND ef_student_in_class(student_id, class_section_id)));

alter policy ef_platform_settings_super on public.platform_settings
  using (ef_is_super_admin())
  with check (ef_is_super_admin());

alter policy ef_presences_select on public.presences
  using (((student_id = auth.uid()) OR (recorded_by = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR (EXISTS ( SELECT 1
   FROM liens_parent_eleve l
  WHERE ((l.parent_id = auth.uid()) AND (l.student_id = presences.student_id))))));

alter policy ef_presences_write_admin on public.presences
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id)))
  with check ((ef_is_super_admin() OR (ef_is_school_admin_of_class(class_section_id) AND ef_student_in_class(student_id, class_section_id) AND ef_subject_in_class_school(class_section_id, subject_id))));

alter policy ef_presences_write_teacher on public.presences
  using (ef_user_teaches_class_subject(class_section_id, subject_id))
  with check ((ef_user_teaches_class_subject(class_section_id, subject_id) AND ef_student_in_class(student_id, class_section_id)));

alter policy ef_profils_select on public.profils
  using (((id = auth.uid()) OR ef_is_super_admin() OR ef_is_school_admin_of_user(id) OR ef_can_view_profile(id)));

alter policy ef_profils_update_self on public.profils
  using (((id = auth.uid()) OR ef_is_super_admin()))
  with check (((id = auth.uid()) OR ef_is_super_admin()));

alter policy ef_programme_admin on public.programme_classe
  using ((ef_is_super_admin() OR (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = programme_classe.class_section_id) AND ef_is_school_admin(c.school_id))))))
  with check ((ef_is_super_admin() OR (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = programme_classe.class_section_id) AND ef_is_school_admin(c.school_id))))));

alter policy ef_programme_select on public.programme_classe
  using ((ef_is_super_admin() OR ef_is_school_admin_of_class(class_section_id) OR (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = programme_classe.class_section_id) AND (c.school_id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids))))) OR ef_user_enrolled_in_class(class_section_id) OR ef_user_teaches_class(class_section_id) OR ef_user_parent_of_student_in_class(class_section_id)));

alter policy ef_roles_select on public.roles_utilisateurs
  using (((user_id = auth.uid()) OR ef_is_super_admin() OR ((school_id IS NOT NULL) AND (role <> 'super_admin'::ef_app_role) AND ef_is_school_admin(school_id)) OR ((school_id IS NOT NULL) AND (role = ANY (ARRAY['school_admin'::ef_app_role, 'teacher'::ef_app_role])) AND (school_id IN ( SELECT ef_user_school_ids() AS ef_user_school_ids)))));

alter policy ef_roles_super_all on public.roles_utilisateurs
  using (ef_is_super_admin())
  with check (ef_is_super_admin());
