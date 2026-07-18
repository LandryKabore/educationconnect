-- Live timetable updates for student/admin clients (postgres_changes).
alter table public.creneaux_edt replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'creneaux_edt'
  ) then
    alter publication supabase_realtime add table public.creneaux_edt;
  end if;
end $$;
