-- Distinguish take-home exercises from exams (replaces generic "devoir").
alter table public.devoirs
  add column if not exists kind text not null default 'exercice_maison';

alter table public.devoirs
  drop constraint if exists devoirs_kind_check;

alter table public.devoirs
  add constraint devoirs_kind_check
  check (kind in ('exercice_maison', 'examen'));

create index if not exists devoirs_kind_idx on public.devoirs (kind);
create index if not exists devoirs_teacher_kind_idx on public.devoirs (teacher_id, kind);
