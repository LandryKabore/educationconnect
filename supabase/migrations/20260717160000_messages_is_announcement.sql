-- Separate school announcements from direct messages for recipient inbox tabs.
alter table public.messages
  add column if not exists is_announcement boolean not null default false;

create index if not exists messages_recipient_announcement_idx
  on public.messages (recipient_id, is_announcement, created_at desc);

-- Tag recent broadcast-style rows that used the Annonce subject prefix.
update public.messages
set is_announcement = true
where is_announcement = false
  and subject is not null
  and subject ilike 'Annonce%';
