-- Role permissions: for each school, who can do what in each module.
-- Builds on 20261116100000_school_modules.sql. Applied to the live database on 16 Nov 2026.
--
--  * Three levels: 'aucun' (the role does not see the module), 'consulter' (read only),
--    'modifier' (read and write).
--  * modules_catalogue.role_access : for each school role, the highest level the app supports
--    ("max": a parent can never edit grades) and the level a school starts with ("default",
--    today's behaviour).
--  * ecole_role_permissions : one row per (school, module, role) once a super admin changes it.
--    No row = the catalogue default. A level above the catalogue max is refused.
--  * ef_role_module_level(school, module, role) : the level in force (module off = 'aucun').
--    Ready for the RLS policies of each module's tables.

-- =========================================================== catalogue ======
alter table public.modules_catalogue
  add column if not exists role_access jsonb not null default '{}'::jsonb;

-- role -> {"max": level, "default": level}
update public.modules_catalogue set role_access = v.access
from (values
  ('emplois_du_temps', '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"consulter","default":"consulter"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('notes',            '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('devoirs',          '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('compositions',     '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('bulletins',        '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"aucun","default":"aucun"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('cahier_textes',    '{"school_admin":{"max":"consulter","default":"consulter"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('presences',        '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"consulter","default":"consulter"},"parent":{"max":"consulter","default":"consulter"}}'::jsonb),
  ('saisie_secretariat','{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"aucun","default":"aucun"},"student":{"max":"aucun","default":"aucun"},"parent":{"max":"aucun","default":"aucun"}}'::jsonb),
  ('messages',         '{"school_admin":{"max":"modifier","default":"modifier"},"teacher":{"max":"modifier","default":"modifier"},"student":{"max":"modifier","default":"modifier"},"parent":{"max":"modifier","default":"modifier"}}'::jsonb),
  ('statistiques',     '{"school_admin":{"max":"consulter","default":"consulter"},"teacher":{"max":"aucun","default":"aucun"},"student":{"max":"aucun","default":"aucun"},"parent":{"max":"aucun","default":"aucun"}}'::jsonb)
) as v(key, access)
where public.modules_catalogue.key = v.key;

-- =========================================================== table ==========
create table if not exists public.ecole_role_permissions (
  school_id   uuid not null references public.ecoles(id) on delete cascade,
  module_key  text not null references public.modules_catalogue(key) on delete cascade,
  role        text not null check (role in ('school_admin', 'teacher', 'student', 'parent')),
  level       text not null check (level in ('aucun', 'consulter', 'modifier')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profils(id) on delete set null,
  primary key (school_id, module_key, role)
);

-- =========================================================== functions ======
create or replace function public.ef_level_rank(_level text)
returns int
language sql
immutable
as $$
  select case _level when 'modifier' then 2 when 'consulter' then 1 else 0 end;
$$;

create or replace function public.ef_role_module_level(_school_id uuid, _module_key text, _role text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.ef_school_has_module(_school_id, _module_key) then 'aucun'
    else coalesce(
      (select p.level from public.ecole_role_permissions p
        where p.school_id = _school_id and p.module_key = _module_key and p.role = _role),
      (select c.role_access -> _role ->> 'default' from public.modules_catalogue c
        where c.key = _module_key),
      'aucun')
  end;
$$;
grant execute on function public.ef_role_module_level(uuid, text, text) to authenticated;

create or replace function public.ef_role_permissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max text;
begin
  select c.role_access -> new.role ->> 'max' into v_max
    from public.modules_catalogue c where c.key = new.module_key;
  if public.ef_level_rank(new.level) > public.ef_level_rank(coalesce(v_max, 'aucun')) then
    raise exception 'Niveau « % » impossible pour ce rôle dans le module %', new.level, new.module_key;
  end if;
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists ecole_role_permissions_guard on public.ecole_role_permissions;
create trigger ecole_role_permissions_guard
  before insert or update on public.ecole_role_permissions
  for each row execute function public.ef_role_permissions_guard();

-- changes go to the same log as the module switches
create or replace function public.ef_role_permissions_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ecole_modules_log
    (school_id, module_key, old_settings, new_settings, changed_by)
  values
    (coalesce(new.school_id, old.school_id), coalesce(new.module_key, old.module_key),
     case when tg_op <> 'INSERT' then jsonb_build_object('role', old.role, 'level', old.level) end,
     case when tg_op <> 'DELETE' then jsonb_build_object('role', new.role, 'level', new.level) end,
     auth.uid());
  return coalesce(new, old);
end;
$$;

drop trigger if exists ecole_role_permissions_log on public.ecole_role_permissions;
create trigger ecole_role_permissions_log
  after insert or update or delete on public.ecole_role_permissions
  for each row execute function public.ef_role_permissions_log();

-- =========================================================== RLS ============
alter table public.ecole_role_permissions enable row level security;

drop policy if exists ecole_role_permissions_select on public.ecole_role_permissions;
create policy ecole_role_permissions_select on public.ecole_role_permissions
  for select to authenticated
  using (public.ef_is_super_admin() or school_id in (select public.ef_user_school_ids()));

drop policy if exists ecole_role_permissions_super_write on public.ecole_role_permissions;
create policy ecole_role_permissions_super_write on public.ecole_role_permissions
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

grant select, insert, update, delete on public.ecole_role_permissions to authenticated;
