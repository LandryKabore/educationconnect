-- « Espace classe »: the students of one class (secondaire only, 6ème → Terminale) work together.
--
--   * Discussions and questions per subject; the author of a question picks the answer that
--     helped; « Moi aussi » on questions, « Merci » on replies. A question can be about an exercise
--     (« Discuter » from Exercices).
--   * Fiches de révision: shared notes per subject (text + photos), « Utile » brings the best up.
--   * Groupes de travail: open groups of 2 to 6 classmates, with their chat and a shared checklist.
--   * Révisions before compositions: built in the apps from the composition sessions (no table).
--
-- Safety (minors): real names; no private messages between students; only the school
-- administration (and super admins) read everything and moderate (hide / restore); a report
-- button on everything, 3 reports hide a message until the administration looks at it;
-- 30 posts / replies / group messages per student per day.
--
-- A school module (« Espace classe », on by default) lets a super admin turn it off for a school.

-- ---------------------------------------------------------------- module

insert into public.modules_catalogue (key, name, description, category, sort_order, available, default_enabled, requires)
values ('espace_classe', 'Espace classe', 'Les élèves d''une même classe (secondaire) s''entraident : questions, fiches de révision, groupes de travail.', 'communication', 215, true, true, '{}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- who

-- 6ème, 5ème, 4ème, 3ème, Seconde / 2nde, Première / 1ère, Terminale
create or replace function public.ef_is_secondary_level(p_level text)
returns boolean language sql immutable as $$
  select coalesce(
    lower(btrim(p_level)) ~ '^[3-6] ?(e|è|ème|eme)\M'
    or lower(btrim(p_level)) ~ '^(seconde|2nde|2de|premi[èe]re|1[èe]re|terminale|tle)', false);
$$;

-- the class whose space this student uses (active this year, secondaire, module on)
create or replace function public.ef_space_class_of(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select i.class_section_id
    from inscriptions i join classes k on k.id = i.class_section_id
   where i.student_id = p_user and i.status = 'active'
     and ef_is_secondary_level(k.grade_level)
     and ef_school_has_module(k.school_id, 'espace_classe')
   order by i.created_at desc nulls last
   limit 1;
$$;

create or replace function public.ef_space_member(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_class is not null and ef_space_class_of(auth.uid()) = p_class;
$$;

create or replace function public.ef_space_moderator(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    ef_is_super_admin()
    or exists (select 1 from classes k where k.id = p_class and k.school_id in (select ef_my_admin_school_ids())));
$$;

grant execute on function public.ef_is_secondary_level(text) to authenticated;
grant execute on function public.ef_space_member(uuid) to authenticated;
grant execute on function public.ef_space_moderator(uuid) to authenticated;
revoke all on function public.ef_space_class_of(uuid) from public, anon;
grant execute on function public.ef_space_class_of(uuid) to authenticated;

-- ---------------------------------------------------------------- tables

create table if not exists public.ef_space_posts (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  author_id        uuid not null references public.profils(id) on delete cascade,
  kind             text not null check (kind in ('question', 'discussion', 'fiche')),
  subject_id       uuid references public.matieres(id) on delete set null,
  evaluation_id    uuid references public.evaluations(id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 1 and 140),
  body             text not null default '' check (char_length(body) <= 4000),
  photos           text[] not null default '{}' check (cardinality(photos) <= 4),
  answer_reply_id  uuid,
  hidden_at        timestamptz,
  hidden_by        uuid references public.profils(id) on delete set null,
  hidden_reason    text check (char_length(hidden_reason) <= 300),
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  last_activity_at timestamptz not null default now()
);
create index if not exists ef_space_posts_class on public.ef_space_posts (class_id, last_activity_at desc);
create index if not exists ef_space_posts_author on public.ef_space_posts (author_id, created_at desc);

create table if not exists public.ef_space_replies (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.ef_space_posts(id) on delete cascade,
  author_id     uuid not null references public.profils(id) on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  photos        text[] not null default '{}' check (cardinality(photos) <= 2),
  hidden_at     timestamptz,
  hidden_by     uuid references public.profils(id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 300),
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index if not exists ef_space_replies_post on public.ef_space_replies (post_id, created_at);
create index if not exists ef_space_replies_author on public.ef_space_replies (author_id, created_at desc);

create table if not exists public.ef_space_reactions (
  target_type text not null check (target_type in ('post', 'reply')),
  target_id   uuid not null,
  user_id     uuid not null references public.profils(id) on delete cascade,
  kind        text not null check (kind in ('moi_aussi', 'utile', 'merci')),
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id, kind)
);
create index if not exists ef_space_reactions_target on public.ef_space_reactions (target_id);

create table if not exists public.ef_space_groups (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  subject_id    uuid references public.matieres(id) on delete set null,
  evaluation_id uuid references public.evaluations(id) on delete set null,
  created_by    uuid not null references public.profils(id) on delete cascade,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  last_activity_at timestamptz not null default now()
);
create index if not exists ef_space_groups_class on public.ef_space_groups (class_id, last_activity_at desc);

create table if not exists public.ef_space_group_members (
  group_id  uuid not null references public.ef_space_groups(id) on delete cascade,
  user_id   uuid not null references public.profils(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists ef_space_group_members_user on public.ef_space_group_members (user_id);

create table if not exists public.ef_space_group_messages (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.ef_space_groups(id) on delete cascade,
  author_id     uuid not null references public.profils(id) on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  photos        text[] not null default '{}' check (cardinality(photos) <= 2),
  hidden_at     timestamptz,
  hidden_by     uuid references public.profils(id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 300),
  created_at    timestamptz not null default now()
);
create index if not exists ef_space_group_messages_group on public.ef_space_group_messages (group_id, created_at desc);
create index if not exists ef_space_group_messages_author on public.ef_space_group_messages (author_id, created_at desc);

create table if not exists public.ef_space_tasks (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.ef_space_groups(id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 140),
  assignee_id uuid references public.profils(id) on delete set null,
  done_at     timestamptz,
  created_by  uuid not null references public.profils(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists ef_space_tasks_group on public.ef_space_tasks (group_id, created_at);

create table if not exists public.ef_space_reports (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'group_message')),
  target_id   uuid not null,
  reporter_id uuid not null references public.profils(id) on delete cascade,
  reason      text not null default '' check (char_length(reason) <= 300),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.profils(id) on delete set null,
  outcome     text check (outcome in ('hidden', 'kept')),
  unique (target_type, target_id, reporter_id)
);
create index if not exists ef_space_reports_class on public.ef_space_reports (class_id, created_at desc);

alter table public.ef_space_posts enable row level security;
alter table public.ef_space_replies enable row level security;
alter table public.ef_space_reactions enable row level security;
alter table public.ef_space_groups enable row level security;
alter table public.ef_space_group_members enable row level security;
alter table public.ef_space_group_messages enable row level security;
alter table public.ef_space_tasks enable row level security;
alter table public.ef_space_reports enable row level security;

-- ---------------------------------------------------------------- visibility helpers

create or replace function public.ef_space_post_class(p_post uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from ef_space_posts where id = p_post;
$$;

create or replace function public.ef_space_group_class(p_group uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from ef_space_groups where id = p_group;
$$;

create or replace function public.ef_space_in_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ef_space_group_members m where m.group_id = p_group and m.user_id = auth.uid())
     and ef_space_member(ef_space_group_class(p_group));
$$;

-- a classmate sees a post unless it is hidden (its author still sees it, marked hidden)
create or replace function public.ef_space_can_see_post(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ef_space_posts p where p.id = p_post and (
    ef_space_moderator(p.class_id)
    or (ef_space_member(p.class_id) and (p.hidden_at is null or p.author_id = auth.uid()))));
$$;

revoke all on function public.ef_space_post_class(uuid) from public, anon;
revoke all on function public.ef_space_group_class(uuid) from public, anon;
grant execute on function public.ef_space_post_class(uuid), public.ef_space_group_class(uuid),
  public.ef_space_in_group(uuid), public.ef_space_can_see_post(uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security

-- posts
drop policy if exists ef_space_posts_select on public.ef_space_posts;
create policy ef_space_posts_select on public.ef_space_posts for select to authenticated
  using (ef_space_moderator(class_id) or (ef_space_member(class_id) and (hidden_at is null or author_id = auth.uid())));
drop policy if exists ef_space_posts_insert on public.ef_space_posts;
create policy ef_space_posts_insert on public.ef_space_posts for insert to authenticated
  with check (author_id = auth.uid() and ef_space_member(class_id));
drop policy if exists ef_space_posts_update on public.ef_space_posts;
create policy ef_space_posts_update on public.ef_space_posts for update to authenticated
  using ((author_id = auth.uid() and ef_space_member(class_id)) or ef_space_moderator(class_id));
drop policy if exists ef_space_posts_delete on public.ef_space_posts;
create policy ef_space_posts_delete on public.ef_space_posts for delete to authenticated
  using ((author_id = auth.uid() and ef_space_member(class_id)) or ef_space_moderator(class_id));

-- replies
drop policy if exists ef_space_replies_select on public.ef_space_replies;
create policy ef_space_replies_select on public.ef_space_replies for select to authenticated
  using (ef_space_can_see_post(post_id)
         and (hidden_at is null or author_id = auth.uid() or ef_space_moderator(ef_space_post_class(post_id))));
drop policy if exists ef_space_replies_insert on public.ef_space_replies;
create policy ef_space_replies_insert on public.ef_space_replies for insert to authenticated
  with check (author_id = auth.uid() and ef_space_member(ef_space_post_class(post_id)) and ef_space_can_see_post(post_id));
drop policy if exists ef_space_replies_update on public.ef_space_replies;
create policy ef_space_replies_update on public.ef_space_replies for update to authenticated
  using ((author_id = auth.uid() and ef_space_member(ef_space_post_class(post_id))) or ef_space_moderator(ef_space_post_class(post_id)));
drop policy if exists ef_space_replies_delete on public.ef_space_replies;
create policy ef_space_replies_delete on public.ef_space_replies for delete to authenticated
  using ((author_id = auth.uid() and ef_space_member(ef_space_post_class(post_id))) or ef_space_moderator(ef_space_post_class(post_id)));

-- reactions (one's own)
drop policy if exists ef_space_reactions_select on public.ef_space_reactions;
create policy ef_space_reactions_select on public.ef_space_reactions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ef_space_reactions_insert on public.ef_space_reactions;
create policy ef_space_reactions_insert on public.ef_space_reactions for insert to authenticated
  with check (user_id = auth.uid() and (
    (target_type = 'post' and ef_space_member(ef_space_post_class(target_id)) and ef_space_can_see_post(target_id))
    or (target_type = 'reply' and exists (select 1 from ef_space_replies r where r.id = target_id
          and ef_space_member(ef_space_post_class(r.post_id)) and ef_space_can_see_post(r.post_id)))));
drop policy if exists ef_space_reactions_delete on public.ef_space_reactions;
create policy ef_space_reactions_delete on public.ef_space_reactions for delete to authenticated
  using (user_id = auth.uid());

-- groups: open to the whole class
drop policy if exists ef_space_groups_select on public.ef_space_groups;
create policy ef_space_groups_select on public.ef_space_groups for select to authenticated
  using (ef_space_member(class_id) or ef_space_moderator(class_id));
drop policy if exists ef_space_groups_insert on public.ef_space_groups;
create policy ef_space_groups_insert on public.ef_space_groups for insert to authenticated
  with check (created_by = auth.uid() and ef_space_member(class_id));
drop policy if exists ef_space_groups_update on public.ef_space_groups;
create policy ef_space_groups_update on public.ef_space_groups for update to authenticated
  using ((created_by = auth.uid() and ef_space_member(class_id)) or ef_space_moderator(class_id));
drop policy if exists ef_space_groups_delete on public.ef_space_groups;
create policy ef_space_groups_delete on public.ef_space_groups for delete to authenticated
  using ((created_by = auth.uid() and ef_space_member(class_id)) or ef_space_moderator(class_id));

drop policy if exists ef_space_group_members_select on public.ef_space_group_members;
create policy ef_space_group_members_select on public.ef_space_group_members for select to authenticated
  using (ef_space_member(ef_space_group_class(group_id)) or ef_space_moderator(ef_space_group_class(group_id)));
drop policy if exists ef_space_group_members_insert on public.ef_space_group_members;
create policy ef_space_group_members_insert on public.ef_space_group_members for insert to authenticated
  with check (user_id = auth.uid() and ef_space_member(ef_space_group_class(group_id)));
drop policy if exists ef_space_group_members_delete on public.ef_space_group_members;
create policy ef_space_group_members_delete on public.ef_space_group_members for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from ef_space_groups g where g.id = group_id and g.created_by = auth.uid())
         or ef_space_moderator(ef_space_group_class(group_id)));

-- group chat and checklist: the group's members (and the administration)
drop policy if exists ef_space_group_messages_select on public.ef_space_group_messages;
create policy ef_space_group_messages_select on public.ef_space_group_messages for select to authenticated
  using ((ef_space_in_group(group_id) and (hidden_at is null or author_id = auth.uid()))
         or ef_space_moderator(ef_space_group_class(group_id)));
drop policy if exists ef_space_group_messages_insert on public.ef_space_group_messages;
create policy ef_space_group_messages_insert on public.ef_space_group_messages for insert to authenticated
  with check (author_id = auth.uid() and ef_space_in_group(group_id));
drop policy if exists ef_space_group_messages_update on public.ef_space_group_messages;
create policy ef_space_group_messages_update on public.ef_space_group_messages for update to authenticated
  using (ef_space_moderator(ef_space_group_class(group_id)));
drop policy if exists ef_space_group_messages_delete on public.ef_space_group_messages;
create policy ef_space_group_messages_delete on public.ef_space_group_messages for delete to authenticated
  using (author_id = auth.uid() or ef_space_moderator(ef_space_group_class(group_id)));

drop policy if exists ef_space_tasks_all on public.ef_space_tasks;
create policy ef_space_tasks_all on public.ef_space_tasks for all to authenticated
  using (ef_space_in_group(group_id) or ef_space_moderator(ef_space_group_class(group_id)))
  with check (ef_space_in_group(group_id));

-- reports: a member reports; the administration reads and handles them
drop policy if exists ef_space_reports_insert on public.ef_space_reports;
create policy ef_space_reports_insert on public.ef_space_reports for insert to authenticated
  with check (reporter_id = auth.uid() and ef_space_member(class_id));
drop policy if exists ef_space_reports_select on public.ef_space_reports;
create policy ef_space_reports_select on public.ef_space_reports for select to authenticated
  using (reporter_id = auth.uid() or ef_space_moderator(class_id));
drop policy if exists ef_space_reports_update on public.ef_space_reports;
create policy ef_space_reports_update on public.ef_space_reports for update to authenticated
  using (ef_space_moderator(class_id));

-- ---------------------------------------------------------------- guards

-- 30 posts / replies / group messages a day per student
create or replace function public.ef_space_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select (select count(*) from ef_space_posts where author_id = new.author_id and created_at > now() - interval '1 day')
       + (select count(*) from ef_space_replies where author_id = new.author_id and created_at > now() - interval '1 day')
       + (select count(*) from ef_space_group_messages where author_id = new.author_id and created_at > now() - interval '1 day')
    into n;
  if n >= 30 then
    raise exception 'Tu as déjà beaucoup écrit aujourd''hui. Réessaie demain.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists ef_space_posts_rate on public.ef_space_posts;
create trigger ef_space_posts_rate before insert on public.ef_space_posts for each row execute function public.ef_space_rate_limit();
drop trigger if exists ef_space_replies_rate on public.ef_space_replies;
create trigger ef_space_replies_rate before insert on public.ef_space_replies for each row execute function public.ef_space_rate_limit();
drop trigger if exists ef_space_group_messages_rate on public.ef_space_group_messages;
create trigger ef_space_group_messages_rate before insert on public.ef_space_group_messages for each row execute function public.ef_space_rate_limit();

-- Posts: an author edits the text and picks the answer; the administration hides / restores.
create or replace function public.ef_space_posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.hidden_at := null; new.hidden_by := null; new.hidden_reason := null;
    new.answer_reply_id := null; new.created_at := now(); new.edited_at := null; new.last_activity_at := now();
    if new.kind = 'fiche' and new.subject_id is null then
      raise exception 'Choisis la matière de la fiche.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.id := old.id; new.class_id := old.class_id; new.author_id := old.author_id; new.created_at := old.created_at;
  -- automatic hiding after reports, or ef_space_moderate
  if current_setting('ef.space_system', true) = 'on' then return new; end if;
  if auth.uid() is not null and ef_space_moderator(old.class_id) and auth.uid() <> old.author_id then
    -- the administration only hides or restores
    new.kind := old.kind; new.subject_id := old.subject_id; new.evaluation_id := old.evaluation_id;
    new.title := old.title; new.body := old.body; new.photos := old.photos;
    new.answer_reply_id := old.answer_reply_id; new.edited_at := old.edited_at;
    if new.hidden_at is not null and old.hidden_at is null then new.hidden_by := auth.uid(); end if;
    if new.hidden_at is null then new.hidden_by := null; new.hidden_reason := null; end if;
    return new;
  end if;
  if auth.uid() is not null then
    new.hidden_at := old.hidden_at; new.hidden_by := old.hidden_by; new.hidden_reason := old.hidden_reason;
    new.kind := old.kind;
    if new.answer_reply_id is distinct from old.answer_reply_id and new.answer_reply_id is not null
       and not exists (select 1 from ef_space_replies r where r.id = new.answer_reply_id and r.post_id = old.id) then
      raise exception 'Réponse introuvable.' using errcode = 'P0001';
    end if;
    if (new.title, new.body, new.photos, new.subject_id) is distinct from (old.title, old.body, old.photos, old.subject_id) then
      new.edited_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ef_space_posts_guard on public.ef_space_posts;
create trigger ef_space_posts_guard before insert or update on public.ef_space_posts
  for each row execute function public.ef_space_posts_guard();

-- Replies and group messages: the author edits the text; the administration hides / restores.
create or replace function public.ef_space_hideable_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  if tg_op = 'INSERT' then
    new.hidden_at := null; new.hidden_by := null; new.hidden_reason := null; new.created_at := now();
    return new;
  end if;
  if tg_table_name = 'ef_space_replies' then
    v_class := ef_space_post_class((to_jsonb(old)->>'post_id')::uuid);
  else
    v_class := ef_space_group_class((to_jsonb(old)->>'group_id')::uuid);
  end if;
  new.id := old.id; new.author_id := old.author_id; new.created_at := old.created_at;
  if current_setting('ef.space_system', true) = 'on' then return new; end if;
  if auth.uid() is not null and ef_space_moderator(v_class) and auth.uid() <> old.author_id then
    new.body := old.body; new.photos := old.photos;
    if new.hidden_at is not null and old.hidden_at is null then new.hidden_by := auth.uid(); end if;
    if new.hidden_at is null then new.hidden_by := null; new.hidden_reason := null; end if;
  elsif auth.uid() is not null then
    new.hidden_at := old.hidden_at; new.hidden_by := old.hidden_by; new.hidden_reason := old.hidden_reason;
  end if;
  return new;
end $$;

drop trigger if exists ef_space_replies_guard on public.ef_space_replies;
create trigger ef_space_replies_guard before insert or update on public.ef_space_replies
  for each row execute function public.ef_space_hideable_guard();
drop trigger if exists ef_space_group_messages_guard on public.ef_space_group_messages;
create trigger ef_space_group_messages_guard before insert or update on public.ef_space_group_messages
  for each row execute function public.ef_space_hideable_guard();

-- Groups: 2 to 6 members; the creator joins at once.
create or replace function public.ef_space_group_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ef_space_group_members (group_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  return new;
end $$;
drop trigger if exists ef_space_group_created on public.ef_space_groups;
create trigger ef_space_group_created after insert on public.ef_space_groups
  for each row execute function public.ef_space_group_created();

create or replace function public.ef_space_group_full()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ef_space_group_members where group_id = new.group_id) >= 6 then
    raise exception 'Ce groupe est complet (6 élèves).' using errcode = 'P0001';
  end if;
  if exists (select 1 from ef_space_groups where id = new.group_id and archived_at is not null) then
    raise exception 'Ce groupe est terminé.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ef_space_group_full on public.ef_space_group_members;
create trigger ef_space_group_full before insert on public.ef_space_group_members
  for each row execute function public.ef_space_group_full();

-- Reports: 3 different reporters hide the message until the administration looks at it.
create or replace function public.ef_space_on_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; a uuid; v_school uuid;
begin
  select count(*) into n from ef_space_reports
   where target_type = new.target_type and target_id = new.target_id and handled_at is null;
  if n >= 3 then
    perform set_config('ef.space_system', 'on', true);
    if new.target_type = 'post' then
      update ef_space_posts set hidden_at = now(), hidden_reason = 'Masqué après plusieurs signalements'
       where id = new.target_id and hidden_at is null;
    elsif new.target_type = 'reply' then
      update ef_space_replies set hidden_at = now(), hidden_reason = 'Masqué après plusieurs signalements'
       where id = new.target_id and hidden_at is null;
    else
      update ef_space_group_messages set hidden_at = now(), hidden_reason = 'Masqué après plusieurs signalements'
       where id = new.target_id and hidden_at is null;
    end if;
    perform set_config('ef.space_system', 'off', true);
  end if;
  -- the administration is told (push)
  select school_id into v_school from classes where id = new.class_id;
  for a in select ef_school_admins(v_school) loop
    perform ef_push_enqueue(a, 'moderation', 'Espace classe : message signalé',
      ef_class_name(new.class_id) || coalesce(' · ' || nullif(trim(new.reason), ''), ''),
      'schoolClassSpace', 'space-report:' || new.id, interval '1 minute');
  end loop;
  return new;
end $$;
drop trigger if exists ef_space_on_report on public.ef_space_reports;
create trigger ef_space_on_report after insert on public.ef_space_reports
  for each row execute function public.ef_space_on_report();

-- Activity and notifications: a reply tells the post's author; a group message the other members;
-- an answer picked tells its author.
create or replace function public.ef_space_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from ef_space_posts where id = new.post_id;
  update ef_space_posts set last_activity_at = now() where id = new.post_id;
  if p.author_id <> new.author_id and p.hidden_at is null then
    perform ef_push_enqueue(p.author_id, 'classe',
      case p.kind when 'question' then 'Réponse à ta question' when 'fiche' then 'Commentaire sur ta fiche' else 'Nouvelle réponse' end,
      ef_first_name(new.author_id) || ' : ' || left(btrim(new.body), 140),
      'classSpace', 'space-post:' || p.id, interval '1 minute');
  end if;
  return new;
end $$;
drop trigger if exists ef_space_on_reply on public.ef_space_replies;
create trigger ef_space_on_reply after insert on public.ef_space_replies
  for each row execute function public.ef_space_on_reply();

create or replace function public.ef_space_on_answer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  if new.answer_reply_id is null or new.answer_reply_id is not distinct from old.answer_reply_id then
    return new;
  end if;
  select author_id into v_author from ef_space_replies where id = new.answer_reply_id;
  if v_author is not null and v_author <> new.author_id then
    perform ef_push_enqueue(v_author, 'classe', 'Ta réponse a aidé',
      ef_first_name(new.author_id) || ' a choisi ta réponse : ' || left(new.title, 120),
      'classSpace', 'space-post:' || new.id, interval '0');
  end if;
  return new;
end $$;
drop trigger if exists ef_space_on_answer on public.ef_space_posts;
create trigger ef_space_on_answer after update of answer_reply_id on public.ef_space_posts
  for each row execute function public.ef_space_on_answer();

create or replace function public.ef_space_on_group_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; m uuid;
begin
  select * into g from ef_space_groups where id = new.group_id;
  update ef_space_groups set last_activity_at = now() where id = new.group_id;
  for m in select user_id from ef_space_group_members where group_id = new.group_id and user_id <> new.author_id loop
    perform ef_push_enqueue(m, 'classe', g.name, ef_first_name(new.author_id) || ' : ' || left(btrim(new.body), 140),
      'classSpace', 'space-group:' || g.id || ':' || m, interval '1 minute');
  end loop;
  return new;
end $$;
drop trigger if exists ef_space_on_group_message on public.ef_space_group_messages;
create trigger ef_space_on_group_message after insert on public.ef_space_group_messages
  for each row execute function public.ef_space_on_group_message();

-- ---------------------------------------------------------------- reading (one call per screen)

-- The space of the signed-in student: their class, or why there is none.
create or replace function public.ef_space_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid; k record;
begin
  if auth.uid() is null then return jsonb_build_object('enabled', false, 'reason', 'auth'); end if;
  v_class := ef_space_class_of(auth.uid());
  if v_class is not null then
    select id, name, grade_level, school_id into k from classes where id = v_class;
    return jsonb_build_object('enabled', true, 'classId', k.id, 'className', k.name, 'gradeLevel', k.grade_level,
      'classmates', (select count(distinct i.student_id) from inscriptions i where i.class_section_id = k.id and i.status = 'active'),
      -- the class's subjects (for the composer and the filters)
      'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.name)
                   from matieres m where m.id in (select subject_id from affectations_enseignement where class_section_id = k.id
                                                  union select subject_id from creneaux_edt where class_section_id = k.id)), '[]'::jsonb),
      -- compositions running or starting within 45 days, with their papers (« Révisions »)
      'compositions', coalesce((select jsonb_agg(jsonb_build_object(
          'id', s.id, 'title', s.title, 'periodLabel', s.period_label, 'startsOn', s.starts_on, 'endsOn', s.ends_on,
          'papers', coalesce((select jsonb_agg(jsonb_build_object('subjectId', e.subject_id, 'subjectName', m.name,
                      'date', e.eval_date, 'start', e.start_time, 'end', e.end_time) order by e.eval_date, e.start_time)
                    from evaluations e left join matieres m on m.id = e.subject_id where e.session_id = s.id), '[]'::jsonb)
        ) order by s.starts_on)
        from composition_sessions s
        where s.class_section_id = k.id
          and coalesce(s.ends_on, s.starts_on) >= (now() at time zone 'Africa/Ouagadougou')::date
          and s.starts_on <= (now() at time zone 'Africa/Ouagadougou')::date + 45), '[]'::jsonb));
  end if;
  select k2.grade_level, k2.school_id into k
    from inscriptions i join classes k2 on k2.id = i.class_section_id
   where i.student_id = auth.uid() and i.status = 'active' limit 1;
  if not found then return jsonb_build_object('enabled', false, 'reason', 'inscription'); end if;
  if not ef_is_secondary_level(k.grade_level) then return jsonb_build_object('enabled', false, 'reason', 'primaire'); end if;
  return jsonb_build_object('enabled', false, 'reason', 'module');
end $$;

-- name shown in the space: « Awa O. »
create or replace function public.ef_space_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(first_name), ''), 'Élève')
         || coalesce(' ' || nullif(left(btrim(last_name), 1), '') || '.', '')
    from profils where id = p_user;
$$;
revoke all on function public.ef_space_name(uuid) from public, anon;

-- Feed of a class: questions, discussions and/or fiches, newest activity first.
create or replace function public.ef_space_feed(
  p_class uuid, p_kind text default null, p_subject uuid default null,
  p_limit int default 30, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_mod boolean := ef_space_moderator(p_class);
begin
  if not (ef_space_member(p_class) or v_mod) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'lastActivityAt') desc)
    from (
      select jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'title', p.title, 'body', left(p.body, 280), 'photos', p.photos,
        'subjectId', p.subject_id, 'subjectName', m.name, 'evaluationId', p.evaluation_id,
        'evaluationTitle', e.title,
        'authorId', p.author_id, 'authorName', ef_space_name(p.author_id), 'mine', p.author_id = auth.uid(),
        'createdAt', p.created_at, 'lastActivityAt', p.last_activity_at,
        'answered', p.answer_reply_id is not null,
        'replies', (select count(*) from ef_space_replies r where r.post_id = p.id and (r.hidden_at is null or v_mod)),
        'moiAussi', (select count(*) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.kind = 'moi_aussi'),
        'utile', (select count(*) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.kind = 'utile'),
        'myReactions', coalesce((select jsonb_agg(x.kind) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.user_id = auth.uid()), '[]'::jsonb),
        'hidden', p.hidden_at is not null, 'hiddenReason', p.hidden_reason,
        'reports', case when v_mod then (select count(*) from ef_space_reports rp where rp.target_type = 'post' and rp.target_id = p.id and rp.handled_at is null) end
      ) as row
      from ef_space_posts p
      left join matieres m on m.id = p.subject_id
      left join evaluations e on e.id = p.evaluation_id
      where p.class_id = p_class
        and (p_kind is null or p.kind = p_kind or (p_kind = 'discussions' and p.kind in ('question', 'discussion')))
        and (p_subject is null or p.subject_id = p_subject)
        and (p.hidden_at is null or v_mod or p.author_id = auth.uid())
        and (p_before is null or p.last_activity_at < p_before)
      order by case when p.kind = 'fiche' and p_kind = 'fiche' then
                 (select count(*) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.kind = 'utile') else 0 end desc,
               p.last_activity_at desc
      limit least(greatest(p_limit, 1), 60)
    ) z
  ), '[]'::jsonb);
end $$;

-- One post with its replies.
create or replace function public.ef_space_post(p_post uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p record; v_mod boolean;
begin
  select * into p from ef_space_posts where id = p_post;
  if not found or not ef_space_can_see_post(p_post) then raise exception 'Message introuvable' using errcode = 'P0002'; end if;
  v_mod := ef_space_moderator(p.class_id);
  return jsonb_build_object(
    'id', p.id, 'classId', p.class_id, 'kind', p.kind, 'title', p.title, 'body', p.body, 'photos', p.photos,
    'subjectId', p.subject_id, 'subjectName', (select name from matieres where id = p.subject_id),
    'evaluationId', p.evaluation_id, 'evaluationTitle', (select title from evaluations where id = p.evaluation_id),
    'authorId', p.author_id, 'authorName', ef_space_name(p.author_id), 'mine', p.author_id = auth.uid(),
    'createdAt', p.created_at, 'editedAt', p.edited_at, 'answerReplyId', p.answer_reply_id,
    'hidden', p.hidden_at is not null, 'hiddenReason', p.hidden_reason,
    'moiAussi', (select count(*) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.kind = 'moi_aussi'),
    'utile', (select count(*) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.kind = 'utile'),
    'myReactions', coalesce((select jsonb_agg(x.kind) from ef_space_reactions x where x.target_type = 'post' and x.target_id = p.id and x.user_id = auth.uid()), '[]'::jsonb),
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'body', r.body, 'photos', r.photos, 'authorId', r.author_id, 'authorName', ef_space_name(r.author_id),
        'mine', r.author_id = auth.uid(), 'createdAt', r.created_at, 'editedAt', r.edited_at,
        'hidden', r.hidden_at is not null, 'hiddenReason', r.hidden_reason,
        'merci', (select count(*) from ef_space_reactions x where x.target_type = 'reply' and x.target_id = r.id and x.kind = 'merci'),
        'myMerci', exists (select 1 from ef_space_reactions x where x.target_type = 'reply' and x.target_id = r.id and x.kind = 'merci' and x.user_id = auth.uid()),
        'reports', case when v_mod then (select count(*) from ef_space_reports rp where rp.target_type = 'reply' and rp.target_id = r.id and rp.handled_at is null) end
      ) order by (r.id = p.answer_reply_id) desc, r.created_at)
      from ef_space_replies r
      where r.post_id = p.id and (r.hidden_at is null or v_mod or r.author_id = auth.uid())), '[]'::jsonb));
end $$;

-- Groups of a class (the ones I am in first).
create or replace function public.ef_space_groups_list(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (ef_space_member(p_class) or ef_space_moderator(p_class)) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'subjectId', g.subject_id, 'subjectName', m.name,
      'evaluationId', g.evaluation_id, 'evaluationTitle', e.title, 'evaluationDate', e.eval_date,
      'createdBy', g.created_by, 'mine', g.created_by = auth.uid(), 'archived', g.archived_at is not null,
      'lastActivityAt', g.last_activity_at,
      'member', exists (select 1 from ef_space_group_members x where x.group_id = g.id and x.user_id = auth.uid()),
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', ef_space_name(x.user_id)) order by x.joined_at)
                            from ef_space_group_members x where x.group_id = g.id), '[]'::jsonb),
      'tasks', (select count(*) from ef_space_tasks t where t.group_id = g.id),
      'tasksDone', (select count(*) from ef_space_tasks t where t.group_id = g.id and t.done_at is not null)
    ) order by exists (select 1 from ef_space_group_members x where x.group_id = g.id and x.user_id = auth.uid()) desc,
               g.archived_at is not null, g.last_activity_at desc)
    from ef_space_groups g
    left join matieres m on m.id = g.subject_id
    left join evaluations e on e.id = g.evaluation_id
    where g.class_id = p_class), '[]'::jsonb);
end $$;

-- One group: members, checklist, last 150 messages (members and the administration).
create or replace function public.ef_space_group(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g record; v_mod boolean; v_in boolean;
begin
  select * into g from ef_space_groups where id = p_group;
  if not found then raise exception 'Groupe introuvable' using errcode = 'P0002'; end if;
  v_mod := ef_space_moderator(g.class_id);
  v_in := ef_space_in_group(p_group);
  if not (v_mod or ef_space_member(g.class_id)) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', g.id, 'classId', g.class_id, 'name', g.name, 'subjectId', g.subject_id,
    'subjectName', (select name from matieres where id = g.subject_id),
    'evaluationId', g.evaluation_id, 'evaluationTitle', (select title from evaluations where id = g.evaluation_id),
    'createdBy', g.created_by, 'mine', g.created_by = auth.uid(), 'member', v_in, 'archived', g.archived_at is not null,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', x.user_id, 'name', ef_space_name(x.user_id)) order by x.joined_at)
                          from ef_space_group_members x where x.group_id = g.id), '[]'::jsonb),
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

-- Administration: open reports of the school, with what was reported.
create or replace function public.ef_space_reports_list(p_school uuid, p_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (ef_is_super_admin() or p_school in (select ef_my_admin_school_ids())) then
    raise exception 'Accès non autorisé' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'targetType', target_type, 'targetId', target_id, 'classId', class_id, 'className', ef_class_name(class_id),
      'count', n, 'reasons', reasons, 'firstAt', first_at, 'handled', handled,
      'text', case target_type
        when 'post' then (select title || coalesce(E'\n' || nullif(body, ''), '') from ef_space_posts where id = target_id)
        when 'reply' then (select body from ef_space_replies where id = target_id)
        else (select body from ef_space_group_messages where id = target_id) end,
      'authorName', case target_type
        when 'post' then (select ef_person_name(author_id) from ef_space_posts where id = target_id)
        when 'reply' then (select ef_person_name(author_id) from ef_space_replies where id = target_id)
        else (select ef_person_name(author_id) from ef_space_group_messages where id = target_id) end,
      'postId', case target_type when 'post' then target_id
        when 'reply' then (select post_id from ef_space_replies where id = target_id) end,
      'groupId', case when target_type = 'group_message' then (select group_id from ef_space_group_messages where id = target_id) end,
      'hidden', case target_type
        when 'post' then (select hidden_at is not null from ef_space_posts where id = target_id)
        when 'reply' then (select hidden_at is not null from ef_space_replies where id = target_id)
        else (select hidden_at is not null from ef_space_group_messages where id = target_id) end
    ) order by first_at desc)
    from (
      select r.target_type, r.target_id, r.class_id, count(*) as n, min(r.created_at) as first_at,
             bool_and(r.handled_at is not null) as handled,
             coalesce(jsonb_agg(r.reason) filter (where nullif(btrim(r.reason), '') is not null), '[]'::jsonb) as reasons
        from ef_space_reports r join classes k on k.id = r.class_id
       where k.school_id = p_school
       group by r.target_type, r.target_id, r.class_id
      having (not p_open) or bool_or(r.handled_at is null)
    ) z), '[]'::jsonb);
end $$;

-- Administration: hide or keep a reported message (closes its reports).
create or replace function public.ef_space_moderate(p_target_type text, p_target_id uuid, p_hide boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  v_class := case p_target_type
    when 'post' then ef_space_post_class(p_target_id)
    when 'reply' then (select ef_space_post_class(post_id) from ef_space_replies where id = p_target_id)
    when 'group_message' then (select ef_space_group_class(group_id) from ef_space_group_messages where id = p_target_id) end;
  if v_class is null or not ef_space_moderator(v_class) then raise exception 'Accès non autorisé' using errcode = '42501'; end if;
  perform set_config('ef.space_system', 'on', true);
  if p_target_type = 'post' then
    update ef_space_posts set hidden_at = case when p_hide then coalesce(hidden_at, now()) end,
           hidden_reason = case when p_hide then coalesce(nullif(btrim(p_reason), ''), 'Masqué par l''administration') end
     where id = p_target_id;
  elsif p_target_type = 'reply' then
    update ef_space_replies set hidden_at = case when p_hide then coalesce(hidden_at, now()) end,
           hidden_reason = case when p_hide then coalesce(nullif(btrim(p_reason), ''), 'Masqué par l''administration') end
     where id = p_target_id;
  else
    update ef_space_group_messages set hidden_at = case when p_hide then coalesce(hidden_at, now()) end,
           hidden_reason = case when p_hide then coalesce(nullif(btrim(p_reason), ''), 'Masqué par l''administration') end
     where id = p_target_id;
  end if;
  perform set_config('ef.space_system', 'off', true);
  update ef_space_reports set handled_at = now(), handled_by = auth.uid(), outcome = case when p_hide then 'hidden' else 'kept' end
   where target_type = p_target_type and target_id = p_target_id and handled_at is null;
end $$;

-- Administration: the secondaire classes of the school with their activity.
create or replace function public.ef_space_school_classes(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (ef_is_super_admin() or p_school in (select ef_my_admin_school_ids())) then
    raise exception 'Accès non autorisé' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'classId', k.id, 'name', k.name, 'gradeLevel', k.grade_level,
      'posts', (select count(*) from ef_space_posts p where p.class_id = k.id),
      'postsWeek', (select count(*) from ef_space_posts p where p.class_id = k.id and p.created_at > now() - interval '7 days'),
      'groups', (select count(*) from ef_space_groups g where g.class_id = k.id and g.archived_at is null),
      'openReports', (select count(distinct (r.target_type, r.target_id)) from ef_space_reports r where r.class_id = k.id and r.handled_at is null)
    ) order by k.name)
    from classes k join annees_scolaires a on a.id = k.academic_year_id and a.is_current
    where k.school_id = p_school and ef_is_secondary_level(k.grade_level)), '[]'::jsonb);
end $$;

grant execute on function public.ef_space_context(), public.ef_space_feed(uuid, text, uuid, int, timestamptz),
  public.ef_space_post(uuid), public.ef_space_groups_list(uuid), public.ef_space_group(uuid),
  public.ef_space_reports_list(uuid, boolean), public.ef_space_moderate(text, uuid, boolean, text),
  public.ef_space_school_classes(uuid) to authenticated;

-- ---------------------------------------------------------------- photos (private, per class)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('espace-classe', 'espace-classe', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- path: <class id>/<author id>/<file>
drop policy if exists ef_space_photos_select on storage.objects;
create policy ef_space_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'espace-classe' and (
    public.ef_space_member(((storage.foldername(name))[1])::uuid)
    or public.ef_space_moderator(((storage.foldername(name))[1])::uuid)));
drop policy if exists ef_space_photos_insert on storage.objects;
create policy ef_space_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'espace-classe'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.ef_space_member(((storage.foldername(name))[1])::uuid));
drop policy if exists ef_space_photos_delete on storage.objects;
create policy ef_space_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'espace-classe' and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.ef_space_moderator(((storage.foldername(name))[1])::uuid)));
