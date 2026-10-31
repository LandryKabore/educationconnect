-- Live composition session alerts for students / parents.
alter table public.composition_sessions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'composition_sessions'
  ) then
    alter publication supabase_realtime add table public.composition_sessions;
  end if;
end $$;
