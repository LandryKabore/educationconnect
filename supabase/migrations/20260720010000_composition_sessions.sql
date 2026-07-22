-- Composition sessions: admin schedules a 2–3 day multi-subject exam block
-- for a class. Each paper is a normal evaluations row (type = composition)
-- linked via session_id. Teachers keep creating devoirs / interrogations only.

create table if not exists public.composition_sessions (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  period_label text not null default 'Trimestre 1',
  title text not null,
  starts_on date not null,
  ends_on date not null,
  created_by uuid references public.profils(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint composition_sessions_date_range check (ends_on >= starts_on)
);

create index if not exists composition_sessions_class_idx
  on public.composition_sessions (class_section_id);

comment on table public.composition_sessions is
  'Session de composition (bloc 2–3 jours) planifiée par l''administration pour une classe.';

alter table public.evaluations
  add column if not exists session_id uuid
    references public.composition_sessions(id) on delete set null;

create index if not exists evaluations_session_idx
  on public.evaluations (session_id)
  where session_id is not null;

-- One paper per matière inside a composition session.
create unique index if not exists evaluations_one_subject_per_session
  on public.evaluations (session_id, subject_id)
  where session_id is not null;

alter table public.composition_sessions enable row level security;

drop policy if exists ef_composition_sessions_select on public.composition_sessions;
create policy ef_composition_sessions_select on public.composition_sessions
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_user_teaches_class(class_section_id)
    or public.ef_user_enrolled_in_class(class_section_id)
    or public.ef_user_parent_of_student_in_class(class_section_id)
  );

drop policy if exists ef_composition_sessions_write on public.composition_sessions;
create policy ef_composition_sessions_write on public.composition_sessions
  for all to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
  )
  with check (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
  );
