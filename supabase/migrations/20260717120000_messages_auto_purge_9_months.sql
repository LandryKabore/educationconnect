-- Auto-delete messages older than 9 months to limit storage growth.

create index if not exists messages_created_at_idx
  on public.messages (created_at);

create or replace function public.ef_purge_old_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.messages
  where created_at < (now() - interval '9 months');

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.ef_purge_old_messages() is
  'Deletes messages older than 9 months. Scheduled daily via pg_cron.';

revoke all on function public.ef_purge_old_messages() from public;
revoke all on function public.ef_purge_old_messages() from anon, authenticated;
grant execute on function public.ef_purge_old_messages() to postgres;

create extension if not exists pg_cron with schema pg_catalog;

-- Idempotent schedule: daily 03:15 UTC
do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'purge-old-messages'
  ) then
    perform cron.unschedule('purge-old-messages');
  end if;

  perform cron.schedule(
    'purge-old-messages',
    '15 3 * * *',
    $cron$select public.ef_purge_old_messages();$cron$
  );
end;
$$;
