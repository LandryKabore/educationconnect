-- Attendance is recorded per subject (cours), not only per day.

alter table public.presences
  add column if not exists subject_id uuid references public.matieres(id) on delete cascade;

-- Backfill existing day-level rows from the recorder's teaching assignment.
update public.presences p
set subject_id = (
  select a.subject_id
  from public.affectations_enseignement a
  where a.class_section_id = p.class_section_id
    and (p.recorded_by is null or a.teacher_id = p.recorded_by)
  order by a.created_at nulls last
  limit 1
)
where p.subject_id is null;

-- Any remaining rows: first subject of the class programme, else any matière of the school.
update public.presences p
set subject_id = (
  select pc.subject_id
  from public.programme_classe pc
  where pc.class_section_id = p.class_section_id
  order by pc.coefficient desc nulls last
  limit 1
)
where p.subject_id is null;

update public.presences p
set subject_id = (
  select m.id
  from public.matieres m
  join public.classes c on c.school_id = m.school_id
  where c.id = p.class_section_id
  order by m.name
  limit 1
)
where p.subject_id is null;

-- Drop rows we still cannot attribute (should be rare).
delete from public.presences where subject_id is null;

alter table public.presences
  alter column subject_id set not null;

alter table public.presences
  drop constraint if exists presences_class_section_id_student_id_date_key;

create unique index if not exists presences_class_student_date_subject_key
  on public.presences (class_section_id, student_id, date, subject_id);

-- Prefer a named unique constraint for PostgREST upsert onConflict.
alter table public.presences
  drop constraint if exists presences_class_student_date_subject_key;
drop index if exists public.presences_class_student_date_subject_key;
alter table public.presences
  add constraint presences_class_student_date_subject_key
  unique (class_section_id, student_id, date, subject_id);

create index if not exists presences_subject_id_idx
  on public.presences (subject_id);
