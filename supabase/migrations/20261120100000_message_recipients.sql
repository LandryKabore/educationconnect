-- « À … · Cc … » on a message, like Gmail: who else received the same message.
-- Proposal prepared 20 Nov 2026. NOT applied to any live database.
--
-- A message sent to several people is stored as one row per recipient, sharing a thread_id
-- (is_cc marks the copies). Row-level security lets each person read only their own row, so
-- the recipient list comes from this function instead:
--   * the caller must be the sender or one of the recipients of that thread (else: no rows);
--   * it returns only names and the To/Cc flag, never the message content of the other rows;
--   * school administrators are flagged so the apps show « Administration » instead of a name.

create or replace function public.ef_message_recipients(p_thread uuid)
returns table (recipient_id uuid, first_name text, last_name text, is_cc boolean, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.recipient_id,
         p.first_name,
         p.last_name,
         bool_and(m.is_cc) as is_cc,
         exists (
           select 1 from roles_utilisateurs r
           where r.user_id = m.recipient_id and r.role = 'school_admin' and r.active
             and r.school_id = m.school_id
         ) as is_admin
  from messages m
  left join profils p on p.id = m.recipient_id
  where m.thread_id = p_thread
    and m.is_announcement is not true
    and exists (
      select 1 from messages mine
      where mine.thread_id = p_thread
        and (mine.sender_id = auth.uid() or mine.recipient_id = auth.uid())
    )
  group by m.recipient_id, p.first_name, p.last_name, m.school_id
  order by bool_and(m.is_cc), p.last_name, p.first_name;
$$;

revoke all on function public.ef_message_recipients(uuid) from public, anon;
grant execute on function public.ef_message_recipients(uuid) to authenticated;
