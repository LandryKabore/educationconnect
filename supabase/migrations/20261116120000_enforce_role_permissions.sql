-- Enforce role permissions in the database, not only in the app.
-- Builds on 20261116110000_role_permissions.sql. Applied to the live database on 16 Nov 2026.
--
-- A teacher or school admin whose level for a module is not 'modifier' (module off,
-- 'aucun' or 'consulter') can no longer insert, update or delete that module's rows,
-- even by calling the API directly.
--
--  * ef_can_write_module(class, module) : true for super admins, server code (no auth.uid()),
--    and teachers / school admins of the class's school whose level is 'modifier'.
--  * RESTRICTIVE policies: they are ANDed with the existing policies, so they can only
--    take rights away, never add any. Existing policies are not touched.
--  * Tables -> modules:
--      notes                     -> notes
--      presences                 -> presences
--      evaluations (by type)     -> interrogation: notes, composition: compositions,
--                                   devoir / examen: devoirs
--      composition_sessions      -> compositions
--      creneaux_edt              -> emplois_du_temps
--  * Foreign-key cascades (a class deleted) are not subject to RLS, so they still work.
-- With the default levels nothing changes: teachers and admins keep 'modifier'.

create or replace function public.ef_can_write_module(_class_id uuid, _module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or public.ef_is_super_admin()
      or exists (
        select 1
        from public.classes c
        join public.roles_utilisateurs r
          on r.school_id = c.school_id and r.user_id = auth.uid() and r.active
        where c.id = _class_id
          and r.role::text in ('school_admin', 'teacher')
          and public.ef_role_module_level(c.school_id, _module_key, r.role::text) = 'modifier'
      );
$$;
grant execute on function public.ef_can_write_module(uuid, text) to authenticated;

create or replace function public.ef_evaluation_module(_type text)
returns text
language sql
immutable
as $$
  select case _type
    when 'interrogation' then 'notes'
    when 'composition' then 'compositions'
    else 'devoirs'
  end;
$$;

-- ---------------------------------------------------------------- notes ----
drop policy if exists notes_module_insert on public.notes;
create policy notes_module_insert on public.notes as restrictive
  for insert to authenticated
  with check (public.ef_can_write_module(class_section_id, 'notes'));
drop policy if exists notes_module_update on public.notes;
create policy notes_module_update on public.notes as restrictive
  for update to authenticated
  using (public.ef_can_write_module(class_section_id, 'notes'))
  with check (public.ef_can_write_module(class_section_id, 'notes'));
drop policy if exists notes_module_delete on public.notes;
create policy notes_module_delete on public.notes as restrictive
  for delete to authenticated
  using (public.ef_can_write_module(class_section_id, 'notes'));

-- ------------------------------------------------------------ presences ----
drop policy if exists presences_module_insert on public.presences;
create policy presences_module_insert on public.presences as restrictive
  for insert to authenticated
  with check (public.ef_can_write_module(class_section_id, 'presences'));
drop policy if exists presences_module_update on public.presences;
create policy presences_module_update on public.presences as restrictive
  for update to authenticated
  using (public.ef_can_write_module(class_section_id, 'presences'))
  with check (public.ef_can_write_module(class_section_id, 'presences'));
drop policy if exists presences_module_delete on public.presences;
create policy presences_module_delete on public.presences as restrictive
  for delete to authenticated
  using (public.ef_can_write_module(class_section_id, 'presences'));

-- ---------------------------------------------------------- evaluations ----
drop policy if exists evaluations_module_insert on public.evaluations;
create policy evaluations_module_insert on public.evaluations as restrictive
  for insert to authenticated
  with check (public.ef_can_write_module(class_section_id, public.ef_evaluation_module(type)));
drop policy if exists evaluations_module_update on public.evaluations;
create policy evaluations_module_update on public.evaluations as restrictive
  for update to authenticated
  using (public.ef_can_write_module(class_section_id, public.ef_evaluation_module(type)))
  with check (public.ef_can_write_module(class_section_id, public.ef_evaluation_module(type)));
drop policy if exists evaluations_module_delete on public.evaluations;
create policy evaluations_module_delete on public.evaluations as restrictive
  for delete to authenticated
  using (public.ef_can_write_module(class_section_id, public.ef_evaluation_module(type)));

-- ------------------------------------------------- composition_sessions ----
drop policy if exists composition_sessions_module_insert on public.composition_sessions;
create policy composition_sessions_module_insert on public.composition_sessions as restrictive
  for insert to authenticated
  with check (public.ef_can_write_module(class_section_id, 'compositions'));
drop policy if exists composition_sessions_module_update on public.composition_sessions;
create policy composition_sessions_module_update on public.composition_sessions as restrictive
  for update to authenticated
  using (public.ef_can_write_module(class_section_id, 'compositions'))
  with check (public.ef_can_write_module(class_section_id, 'compositions'));
drop policy if exists composition_sessions_module_delete on public.composition_sessions;
create policy composition_sessions_module_delete on public.composition_sessions as restrictive
  for delete to authenticated
  using (public.ef_can_write_module(class_section_id, 'compositions'));

-- --------------------------------------------------------- creneaux_edt ----
drop policy if exists creneaux_edt_module_insert on public.creneaux_edt;
create policy creneaux_edt_module_insert on public.creneaux_edt as restrictive
  for insert to authenticated
  with check (public.ef_can_write_module(class_section_id, 'emplois_du_temps'));
drop policy if exists creneaux_edt_module_update on public.creneaux_edt;
create policy creneaux_edt_module_update on public.creneaux_edt as restrictive
  for update to authenticated
  using (public.ef_can_write_module(class_section_id, 'emplois_du_temps'))
  with check (public.ef_can_write_module(class_section_id, 'emplois_du_temps'));
drop policy if exists creneaux_edt_module_delete on public.creneaux_edt;
create policy creneaux_edt_module_delete on public.creneaux_edt as restrictive
  for delete to authenticated
  using (public.ef_can_write_module(class_section_id, 'emplois_du_temps'));
