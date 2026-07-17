-- Every timetable slot must have a teacher (conflict checks rely on it).

delete from public.creneaux_edt where teacher_id is null;

alter table public.creneaux_edt
  alter column teacher_id set not null;
