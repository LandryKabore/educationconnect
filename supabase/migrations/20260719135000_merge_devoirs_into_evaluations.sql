-- Unify "devoirs" (exercices/examens announcements) and "evaluations" (grades)
-- into ONE model: every graded-or-not assignment (interrogation / devoir /
-- composition / examen) is a single evaluations row. Grading stays optional
-- via notes.evaluation_id — nothing forces a teacher to enter scores.
-- This removes the old duplication where a teacher had to create an exam
-- twice (once in "Examens" for scheduling, once in "Notes" to grade it).

-- 1. Extend evaluations with the devoirs-only fields.
alter table public.evaluations
  add column if not exists description text,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists admin_confirmed boolean not null default true,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profils(id);

-- 2. Migrate every devoirs row into evaluations (same id, so nothing that
-- referenced a devoir by id breaks). No period info existed on devoirs, so
-- these land in "Trimestre 1" — harmless since none of them have grades yet.
insert into public.evaluations (
  id, class_section_id, subject_id, teacher_id, period_label, type, title,
  max_score, eval_date, description, start_time, end_time,
  admin_confirmed, confirmed_at, confirmed_by, created_at
)
select
  d.id, d.class_section_id, d.subject_id, d.teacher_id, 'Trimestre 1',
  case when d.kind = 'examen' then 'examen' else 'devoir' end,
  d.title, coalesce(d.max_score, 20), d.due_date, d.description,
  d.start_time, d.end_time, d.admin_confirmed, d.confirmed_at,
  d.confirmed_by, d.created_at
from public.devoirs d
where not exists (select 1 from public.evaluations e where e.id = d.id);

-- 3. One exam per class per calendar day, now enforced on evaluations.
create unique index if not exists evaluations_one_examen_per_class_day
  on public.evaluations (class_section_id, eval_date)
  where type = 'examen' and eval_date is not null;

-- 4. RLS parity: teachers of a class can see (not edit) that class's exams,
-- so they can avoid double-booking an exam day already taken by a colleague.
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

-- 5. Live updates for the merged model (schedule changes, admin confirmation).
alter table public.evaluations replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'evaluations'
  ) then
    alter publication supabase_realtime add table public.evaluations;
  end if;
end $$;

-- 6. Drop the now-redundant tables. rendus_devoirs was never written to by
-- the app (no submission UI existed), so it carries no data to preserve.
drop table if exists public.rendus_devoirs;
drop table if exists public.devoirs;
