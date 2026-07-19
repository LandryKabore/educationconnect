-- Live exam confirmation updates (postgres_changes on devoirs).
alter table public.devoirs replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'devoirs'
  ) then
    alter publication supabase_realtime add table public.devoirs;
  end if;
end $$;
