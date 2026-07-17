-- Reply control on messages: staff can forbid replies; recipients reply when allowed.

alter table public.messages
  add column if not exists allow_replies boolean not null default true,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null;

create index if not exists messages_parent_message_id_idx
  on public.messages (parent_message_id);
