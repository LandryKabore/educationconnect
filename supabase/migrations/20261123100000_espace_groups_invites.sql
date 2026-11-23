-- Espace classe: groups are public (the whole class sees and joins them) or « Sur invitation »
-- (only their members and the classmates invited see them). Whoever creates a group picks the
-- classmates to invite; members of a group can invite more (6 people at most, invitations included).
-- The invited classmate is notified and accepts or declines. The administration still sees everything.

alter table public.ef_space_groups add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'private'));

create table if not exists public.ef_space_group_invites (
  group_id   uuid not null references public.ef_space_groups(id) on delete cascade,
  user_id    uuid not null references public.profils(id) on delete cascade,
  invited_by uuid not null references public.profils(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (group_id, user_id)
);
create index if not exists ef_space_group_invites_user on public.ef_space_group_invites (user_id) where status = 'pending';
alter table public.ef_space_group_invites enable row level security;

create or replace function public.ef_space_invited(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ef_space_group_invites i where i.group_id = p_group and i.user_id = auth.uid() and i.status = 'pending');
$$;
grant execute on function public.ef_space_invited(uuid) to authenticated;

-- who sees a group: public → the class; private → its members and the invited (and the administration)
create or replace function public.ef_space_can_see_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ef_space_groups g where g.id = p_group and (
    ef_space_moderator(g.class_id)
    or (ef_space_member(g.class_id) and (g.visibility = 'public' or ef_space_in_group(g.id) or ef_space_invited(g.id)))));
$$;
grant execute on function public.ef_space_can_see_group(uuid) to authenticated;

drop policy if exists ef_space_groups_select on public.ef_space_groups;
create policy ef_space_groups_select on public.ef_space_groups for select to authenticated
  using (ef_space_moderator(class_id)
         or (ef_space_member(class_id) and (visibility = 'public' or ef_space_in_group(id) or ef_space_invited(id) or created_by = auth.uid())));

drop policy if exists ef_space_group_members_select on public.ef_space_group_members;
create policy ef_space_group_members_select on public.ef_space_group_members for select to authenticated
  using (ef_space_can_see_group(group_id));

-- joining: a public group of my class, or one I am invited to
drop policy if exists ef_space_group_members_insert on public.ef_space_group_members;
create policy ef_space_group_members_insert on public.ef_space_group_members for insert to authenticated
  with check (user_id = auth.uid() and ef_space_member(ef_space_group_class(group_id))
              and (exists (select 1 from ef_space_groups g where g.id = group_id and (g.visibility = 'public' or g.created_by = auth.uid()))
                   or ef_space_invited(group_id)));

-- invitations: members invite classmates; the invited read and answer theirs
drop policy if exists ef_space_group_invites_select on public.ef_space_group_invites;
create policy ef_space_group_invites_select on public.ef_space_group_invites for select to authenticated
  using (user_id = auth.uid() or ef_space_in_group(group_id) or ef_space_moderator(ef_space_group_class(group_id)));
drop policy if exists ef_space_group_invites_insert on public.ef_space_group_invites;
create policy ef_space_group_invites_insert on public.ef_space_group_invites for insert to authenticated
  with check (invited_by = auth.uid() and ef_space_in_group(group_id)
              and ef_space_class_of(user_id) = ef_space_group_class(group_id));
drop policy if exists ef_space_group_invites_delete on public.ef_space_group_invites;
create policy ef_space_group_invites_delete on public.ef_space_group_invites for delete to authenticated
  using (invited_by = auth.uid() or user_id = auth.uid());

-- 6 people at most, pending invitations included; not twice; not a member already
create or replace function public.ef_space_invite_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from ef_space_group_members where group_id = new.group_id and user_id = new.user_id) then
    raise exception 'Cet élève est déjà dans le groupe.' using errcode = 'P0001';
  end if;
  if (select count(*) from ef_space_group_members where group_id = new.group_id)
     + (select count(*) from ef_space_group_invites where group_id = new.group_id and status = 'pending') >= 6 then
    raise exception 'Le groupe est complet (6 élèves, invitations comprises).' using errcode = 'P0001';
  end if;
  if exists (select 1 from ef_space_groups where id = new.group_id and archived_at is not null) then
    raise exception 'Ce groupe est terminé.' using errcode = 'P0001';
  end if;
  new.status := 'pending'; new.created_at := now(); new.answered_at := null;
  return new;
end $$;
drop trigger if exists ef_space_invite_guard on public.ef_space_group_invites;
create trigger ef_space_invite_guard before insert on public.ef_space_group_invites
  for each row execute function public.ef_space_invite_guard();

-- the invited classmate is notified
create or replace function public.ef_space_on_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from ef_space_groups where id = new.group_id;
  perform ef_push_enqueue(new.user_id, 'classe', 'Invitation dans un groupe',
    ef_first_name(new.invited_by) || ' t’invite dans « ' || g.name || ' »',
    'classSpace', 'space-invite:' || g.id, interval '0');
  return new;
end $$;
drop trigger if exists ef_space_on_invite on public.ef_space_group_invites;
create trigger ef_space_on_invite after insert on public.ef_space_group_invites
  for each row execute function public.ef_space_on_invite();

-- a group already full counts the invitations too
create or replace function public.ef_space_group_full()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ef_space_group_members where group_id = new.group_id)
     + (select count(*) from ef_space_group_invites where group_id = new.group_id and status = 'pending' and user_id <> new.user_id) >= 6 then
    raise exception 'Ce groupe est complet (6 élèves).' using errcode = 'P0001';
  end if;
  if exists (select 1 from ef_space_groups where id = new.group_id and archived_at is not null) then
    raise exception 'Ce groupe est terminé.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Accept or decline an invitation.
create or replace function public.ef_space_answer_invite(p_group uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ef_space_invited(p_group) then raise exception 'Invitation introuvable.' using errcode = 'P0002'; end if;
  if p_accept then
    insert into ef_space_group_members (group_id, user_id) values (p_group, auth.uid()) on conflict do nothing;
  end if;
  update ef_space_group_invites set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
   where group_id = p_group and user_id = auth.uid() and status = 'pending';
end $$;
grant execute on function public.ef_space_answer_invite(uuid, boolean) to authenticated;

-- Classmates to invite (my class, without me).
create or replace function public.ef_space_classmates(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not ef_space_member(p_class) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', ef_space_name(p.id)) order by p.first_name, p.last_name)
    from (select distinct i.student_id from inscriptions i where i.class_section_id = p_class and i.status = 'active' and i.student_id <> auth.uid()) s
    join profils p on p.id = s.student_id), '[]'::jsonb);
end $$;
grant execute on function public.ef_space_classmates(uuid) to authenticated;

-- Groups of a class: the ones I can see, my invitations first.
create or replace function public.ef_space_groups_list(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (ef_space_member(p_class) or ef_space_moderator(p_class)) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'subjectId', g.subject_id, 'subjectName', m.name,
      'evaluationId', g.evaluation_id, 'evaluationTitle', e.title, 'evaluationDate', e.eval_date,
      'createdBy', g.created_by, 'mine', g.created_by = auth.uid(), 'archived', g.archived_at is not null,
      'visibility', g.visibility, 'lastActivityAt', g.last_activity_at,
      'member', exists (select 1 from ef_space_group_members x where x.group_id = g.id and x.user_id = auth.uid()),
      'invited', ef_space_invited(g.id),
      'invitedBy', (select ef_space_name(i.invited_by) from ef_space_group_invites i where i.group_id = g.id and i.user_id = auth.uid() and i.status = 'pending'),
      'pendingInvites', (select count(*) from ef_space_group_invites i where i.group_id = g.id and i.status = 'pending'),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', ef_space_name(x.user_id)) order by x.joined_at)
                            from ef_space_group_members x where x.group_id = g.id), '[]'::jsonb),
      'tasks', (select count(*) from ef_space_tasks t where t.group_id = g.id),
      'tasksDone', (select count(*) from ef_space_tasks t where t.group_id = g.id and t.done_at is not null)
    ) order by ef_space_invited(g.id) desc,
               exists (select 1 from ef_space_group_members x where x.group_id = g.id and x.user_id = auth.uid()) desc,
               g.archived_at is not null, g.last_activity_at desc)
    from ef_space_groups g
    left join matieres m on m.id = g.subject_id
    left join evaluations e on e.id = g.evaluation_id
    where g.class_id = p_class and ef_space_can_see_group(g.id)), '[]'::jsonb);
end $$;

-- One group: also its visibility and pending invitations (for its members).
create or replace function public.ef_space_group(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record; v_mod boolean; v_in boolean;
begin
  select * into g from ef_space_groups where id = p_group;
  if not found or not ef_space_can_see_group(p_group) then raise exception 'Groupe introuvable' using errcode = 'P0002'; end if;
  v_mod := ef_space_moderator(g.class_id);
  v_in := ef_space_in_group(p_group);
  return jsonb_build_object(
    'id', g.id, 'classId', g.class_id, 'name', g.name, 'subjectId', g.subject_id,
    'subjectName', (select name from matieres where id = g.subject_id),
    'evaluationId', g.evaluation_id, 'evaluationTitle', (select title from evaluations where id = g.evaluation_id),
    'createdBy', g.created_by, 'mine', g.created_by = auth.uid(), 'member', v_in, 'archived', g.archived_at is not null,
    'visibility', g.visibility, 'invited', ef_space_invited(p_group),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', ef_space_name(x.user_id)) order by x.joined_at)
                          from ef_space_group_members x where x.group_id = g.id), '[]'::jsonb),
    'pending', case when v_in or v_mod then coalesce((select jsonb_agg(jsonb_build_object('id', i.user_id, 'name', ef_space_name(i.user_id)))
                          from ef_space_group_invites i where i.group_id = g.id and i.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end,
    'tasks', case when v_in or v_mod then coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'label', t.label, 'assigneeId', t.assignee_id,
        'assigneeName', case when t.assignee_id is not null then ef_space_name(t.assignee_id) end,
        'done', t.done_at is not null) order by t.done_at is not null, t.created_at)
      from ef_space_tasks t where t.group_id = g.id), '[]'::jsonb) else '[]'::jsonb end,
    'messages', case when v_in or v_mod then coalesce((select jsonb_agg(row order by (row->>'createdAt')) from (
        select jsonb_build_object('id', x.id, 'body', x.body, 'photos', x.photos, 'authorId', x.author_id,
          'authorName', ef_space_name(x.author_id), 'mine', x.author_id = auth.uid(), 'createdAt', x.created_at,
          'hidden', x.hidden_at is not null, 'hiddenReason', x.hidden_reason) as row
        from ef_space_group_messages x
        where x.group_id = g.id and (x.hidden_at is null or v_mod or x.author_id = auth.uid())
        order by x.created_at desc limit 150) z), '[]'::jsonb) else '[]'::jsonb end);
end $$;
