-- Distinguish primary recipients from CC copies on outbound messages.
alter table public.messages
  add column if not exists is_cc boolean not null default false,
  add column if not exists thread_id uuid;

create index if not exists messages_thread_id_idx
  on public.messages (thread_id)
  where thread_id is not null;
