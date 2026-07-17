-- Group broadcast announcement rows in the sender's sent view.
alter table public.messages
  add column if not exists announcement_id uuid;

create index if not exists messages_announcement_id_idx
  on public.messages (announcement_id)
  where announcement_id is not null;
