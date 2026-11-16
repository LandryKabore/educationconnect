-- School modules: the super admin builds each school's system module by module.
-- Applied to the live database on 16 Nov 2026 (Supabase SQL editor).
--
--  * modules_catalogue : one row per module the platform offers (Notes, Présences, Bulletins…,
--                        and later Frais de scolarité, Discipline, Cantine…). Read by everyone
--                        signed in, written only by super admins.
--  * ecole_modules     : one row per (school, module) once a super admin changes it: on/off and
--                        the module's settings for that school (jsonb). No row = the catalogue's
--                        default, so every existing school keeps every feature it has today.
--  * ecole_modules_log : who turned which module on or off, or changed its settings, and when
--                        (filled by trigger, nobody writes to it directly).
--  * ef_school_has_module(school, key) : true when the module is on for that school. Ready for
--                        RLS policies of a module's own tables (a disabled module's data stays
--                        out of reach, not only out of the menu).
-- Existing tables and policies are not touched.

-- =========================================================== tables =========
create table if not exists public.modules_catalogue (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  description     text not null default '',
  category        text not null default 'pedagogie'
                  check (category in ('pedagogie', 'vie_scolaire', 'communication', 'administration', 'services')),
  sort_order      int  not null default 100,
  -- false = shown to super admins as "Bientôt", cannot be turned on yet
  available       boolean not null default true,
  default_enabled boolean not null default true,
  -- other module keys that must be on for this one to work (Bulletins needs Notes)
  requires        text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists public.ecole_modules (
  school_id   uuid not null references public.ecoles(id) on delete cascade,
  module_key  text not null references public.modules_catalogue(key) on delete cascade,
  enabled     boolean not null default true,
  settings    jsonb   not null default '{}'::jsonb
              check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profils(id) on delete set null,
  primary key (school_id, module_key)
);
create index if not exists ecole_modules_module_idx on public.ecole_modules (module_key);

create table if not exists public.ecole_modules_log (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.ecoles(id) on delete cascade,
  module_key   text not null,
  old_enabled  boolean,
  new_enabled  boolean,
  old_settings jsonb,
  new_settings jsonb,
  changed_by   uuid references public.profils(id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index if not exists ecole_modules_log_school_idx on public.ecole_modules_log (school_id, changed_at desc);

-- =========================================================== catalogue ======
insert into public.modules_catalogue (key, name, description, category, sort_order, available, default_enabled, requires) values
  ('emplois_du_temps', 'Emplois du temps', 'Emploi du temps des classes, des enseignants et des élèves.', 'pedagogie', 10, true, true, '{}'),
  ('notes', 'Notes', 'Évaluations, saisie des notes et moyennes par matière.', 'pedagogie', 20, true, true, '{}'),
  ('devoirs', 'Devoirs et examens', 'Exercices de maison, interrogations et examens programmés.', 'pedagogie', 30, true, true, '{}'),
  ('compositions', 'Compositions', 'Sessions de compositions organisées par l''administration.', 'pedagogie', 40, true, true, '{notes}'),
  ('bulletins', 'Bulletins', 'Bulletins de chaque Trimestre : moyenne, rang, appréciation, PDF.', 'pedagogie', 50, true, true, '{notes}'),
  ('cahier_textes', 'Cahier de textes', 'Contenu des cours et avancement des programmes.', 'pedagogie', 60, true, true, '{}'),
  ('presences', 'Présences', 'Appel à chaque cours, absences, retards et justifications.', 'vie_scolaire', 110, true, true, '{}'),
  ('saisie_secretariat', 'Saisie par le secrétariat', 'Le secrétariat saisit à la place d''un enseignant sans connexion.', 'vie_scolaire', 120, true, true, '{}'),
  ('messages', 'Messages et annonces', 'Messagerie interne et annonces de l''école.', 'communication', 210, true, true, '{}'),
  ('statistiques', 'Statistiques', 'Résultats et présences par classe et par matière.', 'administration', 310, true, true, '{}'),
  -- coming next: listed so super admins see the roadmap, not switchable yet
  ('frais_scolarite', 'Frais de scolarité', 'Échéances, paiements, reçus et relances, paiement mobile.', 'administration', 320, false, false, '{}'),
  ('discipline', 'Discipline', 'Avertissements, sanctions et conduite.', 'vie_scolaire', 130, false, false, '{}'),
  ('sms', 'Alertes SMS', 'Absences et notes envoyées aux parents par SMS.', 'communication', 220, false, false, '{}'),
  ('certificats', 'Certificats', 'Certificats de scolarité et attestations.', 'administration', 330, false, false, '{}'),
  ('cantine', 'Cantine', 'Inscriptions et suivi des repas.', 'services', 410, false, false, '{}'),
  ('bibliotheque', 'Bibliothèque', 'Prêts et retours de livres.', 'services', 420, false, false, '{}'),
  ('transport', 'Transport', 'Circuits et inscriptions au transport scolaire.', 'services', 430, false, false, '{}')
on conflict (key) do nothing;

-- =========================================================== functions ======
create or replace function public.ef_school_has_module(_school_id uuid, _module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select em.enabled from public.ecole_modules em
      where em.school_id = _school_id and em.module_key = _module_key),
    (select c.default_enabled and c.available from public.modules_catalogue c
      where c.key = _module_key),
    false
  );
$$;
grant execute on function public.ef_school_has_module(uuid, text) to authenticated;

-- A module can only be turned on when it is available and the modules it needs are on.
create or replace function public.ef_ecole_modules_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available boolean;
  v_requires  text[];
  v_missing   text;
begin
  if new.enabled then
    select available, requires into v_available, v_requires
      from public.modules_catalogue where key = new.module_key;
    if not coalesce(v_available, false) then
      raise exception 'Le module % n''est pas encore disponible', new.module_key;
    end if;
    select r into v_missing from unnest(v_requires) r
      where not public.ef_school_has_module(new.school_id, r) limit 1;
    if v_missing is not null then
      raise exception 'Le module % nécessite le module %', new.module_key, v_missing;
    end if;
  else
    -- turning a module off: the modules that need it must be off first
    select c.key into v_missing from public.modules_catalogue c
      where new.module_key = any (c.requires)
        and public.ef_school_has_module(new.school_id, c.key)
      limit 1;
    if v_missing is not null then
      raise exception 'Désactivez d''abord le module %, qui utilise %', v_missing, new.module_key;
    end if;
  end if;
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists ecole_modules_guard on public.ecole_modules;
create trigger ecole_modules_guard
  before insert or update on public.ecole_modules
  for each row execute function public.ef_ecole_modules_guard();

create or replace function public.ef_ecole_modules_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.ecole_modules_log (school_id, module_key, old_enabled, old_settings, changed_by)
    values (old.school_id, old.module_key, old.enabled, old.settings, auth.uid());
    return old;
  end if;
  if tg_op = 'UPDATE' and old.enabled = new.enabled and old.settings = new.settings then
    return new;
  end if;
  insert into public.ecole_modules_log
    (school_id, module_key, old_enabled, new_enabled, old_settings, new_settings, changed_by)
  values
    (new.school_id, new.module_key,
     case when tg_op = 'UPDATE' then old.enabled end, new.enabled,
     case when tg_op = 'UPDATE' then old.settings end, new.settings,
     auth.uid());
  return new;
end;
$$;

drop trigger if exists ecole_modules_log on public.ecole_modules;
create trigger ecole_modules_log
  after insert or update or delete on public.ecole_modules
  for each row execute function public.ef_ecole_modules_log();

-- =========================================================== RLS ============
alter table public.modules_catalogue enable row level security;
alter table public.ecole_modules     enable row level security;
alter table public.ecole_modules_log enable row level security;

drop policy if exists modules_catalogue_select on public.modules_catalogue;
create policy modules_catalogue_select on public.modules_catalogue
  for select to authenticated using (true);

drop policy if exists modules_catalogue_super_write on public.modules_catalogue;
create policy modules_catalogue_super_write on public.modules_catalogue
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

-- Everyone in a school can read its modules (the app hides what is off); super admins read all.
drop policy if exists ecole_modules_select on public.ecole_modules;
create policy ecole_modules_select on public.ecole_modules
  for select to authenticated
  using (public.ef_is_super_admin() or school_id in (select public.ef_user_school_ids()));

-- Only super admins turn modules on or off and change their settings.
drop policy if exists ecole_modules_super_write on public.ecole_modules;
create policy ecole_modules_super_write on public.ecole_modules
  for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

drop policy if exists ecole_modules_log_select on public.ecole_modules_log;
create policy ecole_modules_log_select on public.ecole_modules_log
  for select to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));
-- no insert / update / delete policy: only the trigger writes the log

grant select on public.modules_catalogue to authenticated;
grant select, insert, update, delete on public.ecole_modules to authenticated;
grant select on public.ecole_modules_log to authenticated;
