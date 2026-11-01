-- Scale pack 1/4: indexes for the "by student / by date / by class / by school" lookups.
--
-- Why: with ~2,000 students (370k attendance rows, 60k grades) every one of these
-- lookups either walked a whole index or scanned the table (see qa/big-data.md).
-- Plain CREATE INDEX is used so the migration stays transactional.  On a table that is
-- already huge and busy, run the same statements by hand with CREATE INDEX CONCURRENTLY
-- first (outside a transaction) -- "if not exists" makes this migration a no-op afterwards.
-- Rollback: rollback/20261101100000_scale_indexes.down.sql

create index if not exists presences_student_date_idx
  on public.presences (student_id, date desc);
create index if not exists presences_date_class_idx
  on public.presences (date, class_section_id);

create index if not exists notes_student_idx
  on public.notes (student_id);
create index if not exists notes_class_subject_idx
  on public.notes (class_section_id, subject_id);

create index if not exists inscriptions_class_idx
  on public.inscriptions (class_section_id, student_id) include (status);

create index if not exists classes_school_idx
  on public.classes (school_id);

create index if not exists roles_utilisateurs_school_role_idx
  on public.roles_utilisateurs (school_id, role, user_id);

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

create index if not exists liens_parent_eleve_student_idx
  on public.liens_parent_eleve (student_id);

create index if not exists affectations_enseignement_class_idx
  on public.affectations_enseignement (class_section_id);

create index if not exists creneaux_edt_class_idx
  on public.creneaux_edt (class_section_id);
create index if not exists creneaux_edt_teacher_idx
  on public.creneaux_edt (teacher_id);

create index if not exists identifiants_temporaires_user_idx
  on public.identifiants_temporaires (user_id);

analyze public.presences, public.notes, public.inscriptions, public.classes,
        public.roles_utilisateurs, public.messages, public.liens_parent_eleve,
        public.affectations_enseignement, public.creneaux_edt,
        public.identifiants_temporaires;
