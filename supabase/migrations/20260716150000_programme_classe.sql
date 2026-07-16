-- Per-class subject coefficients (specialization / filière)
create table if not exists public.programme_classe (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  coefficient numeric not null default 1 check (coefficient > 0),
  created_at timestamptz not null default now(),
  unique (class_section_id, subject_id)
);

comment on table public.programme_classe is
  'Matières du programme d''une classe avec coefficient spécifique (filière / spécialisation)';

alter table public.programme_classe enable row level security;

create policy ef_programme_select on public.programme_classe
  for select to authenticated
  using (
    public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or exists (
      select 1 from public.classes c
      where c.id = programme_classe.class_section_id
        and c.school_id in (select public.ef_user_school_ids())
    )
    or exists (
      select 1 from public.inscriptions i
      where i.class_section_id = programme_classe.class_section_id
        and i.student_id = auth.uid()
        and i.status = 'active'
    )
    or exists (
      select 1 from public.affectations_enseignement a
      where a.class_section_id = programme_classe.class_section_id
        and a.teacher_id = auth.uid()
    )
    or exists (
      select 1 from public.liens_parent_eleve l
      join public.inscriptions i on i.student_id = l.student_id and i.status = 'active'
      where l.parent_id = auth.uid()
        and i.class_section_id = programme_classe.class_section_id
    )
  );

create policy ef_programme_admin on public.programme_classe
  for all to authenticated
  using (
    public.ef_is_super_admin()
    or exists (
      select 1 from public.classes c
      where c.id = programme_classe.class_section_id
        and public.ef_is_school_admin(c.school_id)
    )
  )
  with check (
    public.ef_is_super_admin()
    or exists (
      select 1 from public.classes c
      where c.id = programme_classe.class_section_id
        and public.ef_is_school_admin(c.school_id)
    )
  );
