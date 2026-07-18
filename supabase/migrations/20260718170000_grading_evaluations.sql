-- New grading model: evaluations (assessments) + grades linked to them.
-- A grade belongs to one evaluation; the SUBJECT coefficient governs weighting
-- (evaluations are NOT individually weighted). Exams are graded here too, so
-- exam results flow into the bulletin. Exercices de maison stay display-only.

-- 1. Evaluations = one graded assessment for a class + subject + period.
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  teacher_id uuid not null references public.profils(id) on delete cascade,
  period_label text not null default 'Trimestre 1',
  type text not null default 'devoir',
  title text not null,
  max_score numeric not null default 20,
  eval_date date,
  created_at timestamptz not null default now()
);

alter table public.evaluations
  drop constraint if exists evaluations_type_check;
alter table public.evaluations
  add constraint evaluations_type_check
  check (type in ('interrogation', 'devoir', 'composition', 'examen'));

create index if not exists evaluations_class_idx
  on public.evaluations (class_section_id);
create index if not exists evaluations_subject_idx
  on public.evaluations (subject_id);
create index if not exists evaluations_teacher_idx
  on public.evaluations (teacher_id);

-- 2. Link grades to an evaluation and support "absent" (excluded from averages).
alter table public.notes
  add column if not exists evaluation_id uuid references public.evaluations(id) on delete cascade;
alter table public.notes
  add column if not exists is_absent boolean not null default false;

-- One grade per (evaluation, student) so the grade grid can upsert / edit.
create unique index if not exists notes_evaluation_student_uidx
  on public.notes (evaluation_id, student_id)
  where evaluation_id is not null;

-- 3. RLS: same access model as notes/devoirs.
alter table public.evaluations enable row level security;

drop policy if exists ef_evaluations_select on public.evaluations;
create policy ef_evaluations_select on public.evaluations
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_evaluations_write on public.evaluations;
create policy ef_evaluations_write on public.evaluations
  for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
  );
