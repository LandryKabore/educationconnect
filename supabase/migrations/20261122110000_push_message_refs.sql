-- Push notifications: messages and announcements remember which message they are about
-- (ref « msg:<id> »), so tapping one opens that conversation or announcement in the app.
-- Applied to production (hbfjtsxzueftoiryzhxh) on 22 Nov 2026.

create or replace function public.ef_push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  -- students for now
  if not exists (select 1 from roles_utilisateurs r where r.user_id = new.recipient_id and r.role = 'student' and r.active) then
    return new;
  end if;
  if new.is_announcement is true then
    perform ef_push_enqueue(new.recipient_id, 'annonce', 'Nouvelle annonce',
      coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'announcements', 'msg:' || new.id, interval '0');
    return new;
  end if;
  -- school administrators appear as « Administration », never by name
  select case
           when exists (select 1 from roles_utilisateurs r where r.user_id = new.sender_id and r.role = 'school_admin'
                          and r.active and r.school_id = new.school_id) then 'Administration'
           else nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
         end
    into v_from
    from profils p where p.id = new.sender_id;
  perform ef_push_enqueue(new.recipient_id, 'message', coalesce(v_from, 'Nouveau message'),
    coalesce(nullif(trim(new.subject), ''), left(new.body, 120)), 'messages', 'msg:' || new.id, interval '0');
  return new;
end $$;
