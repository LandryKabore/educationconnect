-- Live grade and attendance updates (postgres_changes).
alter table public.notes replica identity full;
alter table public.presences replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presences'
  ) then
    alter publication supabase_realtime add table public.presences;
  end if;
end $$;
