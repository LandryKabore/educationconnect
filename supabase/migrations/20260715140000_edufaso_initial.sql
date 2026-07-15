-- EduFaso schema (French table names to avoid clashes with legacy apps)
-- Run in Supabase SQL Editor or via CLI migration

create extension if not exists "pgcrypto";

do $$ begin
  create type public.ef_app_role as enum (
    'super_admin', 'school_admin', 'teacher', 'student', 'parent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ef_attendance_status as enum (
    'present', 'absent', 'late', 'excused'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.ecoles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  city text,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  must_change_password boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.roles_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profils(id) on delete cascade,
  role public.ef_app_role not null,
  school_id uuid references public.ecoles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role, school_id)
);

create table if not exists public.annees_scolaires (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ecoles(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ecoles(id) on delete cascade,
  academic_year_id uuid not null references public.annees_scolaires(id) on delete cascade,
  name text not null,
  grade_level text not null default '',
  capacity int,
  created_at timestamptz not null default now()
);

create table if not exists public.matieres (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ecoles(id) on delete cascade,
  name text not null,
  code text,
  coefficient numeric not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.inscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profils(id) on delete cascade,
  class_section_id uuid not null references public.classes(id) on delete cascade,
  academic_year_id uuid not null references public.annees_scolaires(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create table if not exists public.affectations_enseignement (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profils(id) on delete cascade,
  class_section_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_section_id, subject_id)
);

create table if not exists public.liens_parent_eleve (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profils(id) on delete cascade,
  student_id uuid not null references public.profils(id) on delete cascade,
  relationship text default 'parent',
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

create table if not exists public.presences (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profils(id) on delete cascade,
  date date not null default current_date,
  status public.ef_attendance_status not null default 'present',
  note text,
  recorded_by uuid references public.profils(id),
  created_at timestamptz not null default now(),
  unique (class_section_id, student_id, date)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profils(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  class_section_id uuid not null references public.classes(id) on delete cascade,
  period_label text not null default 'Trimestre 1',
  score numeric not null,
  max_score numeric not null default 20,
  comment text,
  recorded_by uuid references public.profils(id),
  created_at timestamptz not null default now()
);

create table if not exists public.devoirs (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  teacher_id uuid not null references public.profils(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  max_score numeric not null default 20,
  created_at timestamptz not null default now()
);

create table if not exists public.rendus_devoirs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.devoirs(id) on delete cascade,
  student_id uuid not null references public.profils(id) on delete cascade,
  content text,
  submitted_at timestamptz,
  score numeric,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.creneaux_edt (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.matieres(id) on delete cascade,
  teacher_id uuid references public.profils(id),
  day_of_week int not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.ecoles(id) on delete cascade,
  sender_id uuid not null references public.profils(id) on delete cascade,
  recipient_id uuid not null references public.profils(id) on delete cascade,
  subject text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.identifiants_temporaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profils(id) on delete cascade,
  username text not null unique,
  temp_password_hint text,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Helper functions (security definer in private-ish usage via RLS)
create or replace function public.ef_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.roles_utilisateurs
    where user_id = auth.uid() and role = 'super_admin' and active = true
  );
$$;

create or replace function public.ef_is_school_admin(_school_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.roles_utilisateurs
    where user_id = auth.uid()
      and role = 'school_admin'
      and active = true
      and (_school_id is null or school_id = _school_id)
  );
$$;

create or replace function public.ef_user_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct school_id from public.roles_utilisateurs
  where user_id = auth.uid() and active = true and school_id is not null;
$$;

create or replace function public.ef_primary_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.roles_utilisateurs
  where user_id = auth.uid() and active = true
  order by case role
    when 'super_admin' then 1
    when 'school_admin' then 2
    when 'teacher' then 3
    when 'student' then 4
    when 'parent' then 5
  end
  limit 1;
$$;

create or replace function public.ef_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, first_name, last_name, email, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ef on auth.users;
create trigger on_auth_user_created_ef
  after insert on auth.users
  for each row execute function public.ef_handle_new_user();

-- RLS
alter table public.ecoles enable row level security;
alter table public.profils enable row level security;
alter table public.roles_utilisateurs enable row level security;
alter table public.annees_scolaires enable row level security;
alter table public.classes enable row level security;
alter table public.matieres enable row level security;
alter table public.inscriptions enable row level security;
alter table public.affectations_enseignement enable row level security;
alter table public.liens_parent_eleve enable row level security;
alter table public.presences enable row level security;
alter table public.notes enable row level security;
alter table public.devoirs enable row level security;
alter table public.rendus_devoirs enable row level security;
alter table public.creneaux_edt enable row level security;
alter table public.messages enable row level security;
alter table public.identifiants_temporaires enable row level security;

-- Profiles
create policy ef_profils_select on public.profils for select to authenticated
  using (id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin());
create policy ef_profils_update_self on public.profils for update to authenticated
  using (id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin());

-- Roles
create policy ef_roles_select on public.roles_utilisateurs for select to authenticated
  using (user_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_roles_admin_all on public.roles_utilisateurs for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

-- Schools
create policy ef_ecoles_select on public.ecoles for select to authenticated
  using (public.ef_is_super_admin() or id in (select public.ef_user_school_ids()));
create policy ef_ecoles_super on public.ecoles for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

-- Generic school-scoped tables
create policy ef_annees_all on public.annees_scolaires for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id) or school_id in (select public.ef_user_school_ids()))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

create policy ef_classes_all on public.classes for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id) or school_id in (select public.ef_user_school_ids()))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

create policy ef_matieres_all on public.matieres for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id) or school_id in (select public.ef_user_school_ids()))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

create policy ef_inscriptions_select on public.inscriptions for select to authenticated
  using (
    student_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or exists (select 1 from public.affectations_enseignement a where a.class_section_id = inscriptions.class_section_id and a.teacher_id = auth.uid())
    or exists (select 1 from public.liens_parent_eleve l where l.parent_id = auth.uid() and l.student_id = inscriptions.student_id)
  );
create policy ef_inscriptions_admin on public.inscriptions for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (public.ef_is_super_admin() or public.ef_is_school_admin());

create policy ef_aff_select on public.affectations_enseignement for select to authenticated
  using (teacher_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin());
create policy ef_aff_admin on public.affectations_enseignement for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (public.ef_is_super_admin() or public.ef_is_school_admin());

create policy ef_liens_select on public.liens_parent_eleve for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin());
create policy ef_liens_admin on public.liens_parent_eleve for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (public.ef_is_super_admin() or public.ef_is_school_admin());

create policy ef_presences_select on public.presences for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin() or public.ef_is_school_admin()
    or exists (select 1 from public.affectations_enseignement a where a.class_section_id = presences.class_section_id and a.teacher_id = auth.uid())
    or exists (select 1 from public.liens_parent_eleve l where l.parent_id = auth.uid() and l.student_id = presences.student_id)
  );
create policy ef_presences_write on public.presences for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin() or exists (
    select 1 from public.affectations_enseignement a where a.class_section_id = presences.class_section_id and a.teacher_id = auth.uid()
  ))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin() or exists (
    select 1 from public.affectations_enseignement a where a.class_section_id = presences.class_section_id and a.teacher_id = auth.uid()
  ));

create policy ef_notes_select on public.notes for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin() or public.ef_is_school_admin()
    or exists (select 1 from public.affectations_enseignement a where a.class_section_id = notes.class_section_id and a.teacher_id = auth.uid())
    or exists (select 1 from public.liens_parent_eleve l where l.parent_id = auth.uid() and l.student_id = notes.student_id)
  );
create policy ef_notes_write on public.notes for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin() or exists (
    select 1 from public.affectations_enseignement a where a.class_section_id = notes.class_section_id and a.teacher_id = auth.uid()
  ))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin() or exists (
    select 1 from public.affectations_enseignement a where a.class_section_id = notes.class_section_id and a.teacher_id = auth.uid()
  ));

create policy ef_devoirs_select on public.devoirs for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin() or public.ef_is_school_admin()
    or exists (select 1 from public.inscriptions i where i.class_section_id = devoirs.class_section_id and i.student_id = auth.uid() and i.status = 'active')
    or exists (
      select 1 from public.inscriptions i
      join public.liens_parent_eleve l on l.student_id = i.student_id
      where i.class_section_id = devoirs.class_section_id and l.parent_id = auth.uid()
    )
  );
create policy ef_devoirs_write on public.devoirs for all to authenticated
  using (teacher_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (teacher_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin());

create policy ef_rendus_select on public.rendus_devoirs for select to authenticated
  using (student_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin() or exists (
    select 1 from public.devoirs d where d.id = rendus_devoirs.assignment_id and d.teacher_id = auth.uid()
  ) or exists (select 1 from public.liens_parent_eleve l where l.parent_id = auth.uid() and l.student_id = rendus_devoirs.student_id));
create policy ef_rendus_student on public.rendus_devoirs for insert to authenticated
  with check (student_id = auth.uid());
create policy ef_rendus_update on public.rendus_devoirs for update to authenticated
  using (student_id = auth.uid() or exists (select 1 from public.devoirs d where d.id = rendus_devoirs.assignment_id and d.teacher_id = auth.uid()) or public.ef_is_school_admin());

create policy ef_edt_select on public.creneaux_edt for select to authenticated
  using (true);
create policy ef_edt_admin on public.creneaux_edt for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (public.ef_is_super_admin() or public.ef_is_school_admin());

create policy ef_messages_select on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
create policy ef_messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid());
create policy ef_messages_update on public.messages for update to authenticated
  using (recipient_id = auth.uid() or sender_id = auth.uid());

create policy ef_temp_admin on public.identifiants_temporaires for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin())
  with check (public.ef_is_super_admin() or public.ef_is_school_admin());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.ef_is_super_admin() to authenticated;
grant execute on function public.ef_is_school_admin(uuid) to authenticated;
grant execute on function public.ef_user_school_ids() to authenticated;
grant execute on function public.ef_primary_role() to authenticated;
