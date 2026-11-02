-- Idea 24: "Signaler un problème" reports with automatic diagnostics.
-- Proposal prepared 1 Nov 2026. NOT applied to any live database.
--
--  * signalements : one row per report. The app sends the page, app version, platform, online state,
--                   browser and the last few error messages; the DATABASE adds who and which school
--                   (the client cannot choose them) and limits sizes and frequency.
--  * RLS          : author inserts and reads own; school admin reads (and sets the status of) the reports
--                   of their school; super admin reads and updates all. Nobody deletes.
--  * Column grants: authors can only fill the diagnostic columns; admins can only update status + admin_note.

create table if not exists public.signalements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profils(id) on delete cascade,
  school_id      uuid references public.ecoles(id) on delete set null,
  role           text,
  route          text check (route is null or char_length(route) <= 300),
  app_version    text check (app_version is null or char_length(app_version) <= 40),
  platform       text check (platform is null or char_length(platform) <= 40),
  online         boolean,
  user_agent     text check (user_agent is null or char_length(user_agent) <= 400),
  viewport       text check (viewport is null or char_length(viewport) <= 30),
  error_messages jsonb not null default '[]'::jsonb,
  message        text not null check (char_length(btrim(message)) between 5 and 2000),
  status         text not null default 'nouveau' check (status in ('nouveau', 'vu', 'en_cours', 'resolu')),
  admin_note     text check (admin_note is null or char_length(admin_note) <= 1000),
  handled_by     uuid references public.profils(id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists signalements_school_idx on public.signalements (school_id, created_at desc);
create index if not exists signalements_user_idx   on public.signalements (user_id, created_at desc);
create index if not exists signalements_status_idx on public.signalements (status, created_at desc);

alter table public.signalements enable row level security;

revoke all on public.signalements from anon, authenticated;
grant select on public.signalements to authenticated;
grant insert (route, app_version, platform, online, user_agent, viewport, error_messages, message)
  on public.signalements to authenticated;
grant update (status, admin_note) on public.signalements to authenticated;

drop policy if exists ef_signalements_insert on public.signalements;
create policy ef_signalements_insert on public.signalements for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists ef_signalements_select on public.signalements;
create policy ef_signalements_select on public.signalements for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
  );

drop policy if exists ef_signalements_update on public.signalements;
create policy ef_signalements_update on public.signalements for update to authenticated
  using (
    (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
  )
  with check (
    (select public.ef_is_super_admin())
    or school_id in (select public.ef_my_admin_school_ids())
  );

-- Server-side fields + abuse limits (insert) and handled_by / handled_at (update).
create or replace function public.ef_signalements_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is null then
      raise exception 'Non authentifié' using errcode = '42501';
    end if;
    new.user_id := v_uid;
    new.status := 'nouveau';
    new.admin_note := null;
    new.handled_by := null;
    new.handled_at := null;
    new.message := btrim(new.message);

    select r.role::text, r.school_id into new.role, new.school_id
    from public.roles_utilisateurs r
    where r.user_id = v_uid and r.active = true
    order by case r.role when 'super_admin' then 1 when 'school_admin' then 2 when 'teacher' then 3
                         when 'student' then 4 else 5 end
    limit 1;

    if jsonb_typeof(new.error_messages) is distinct from 'array'
       or jsonb_array_length(new.error_messages) > 10
       or pg_column_size(new.error_messages) > 6000 then
      new.error_messages := '[]'::jsonb;
    end if;

    if (select count(*) from public.signalements s
        where s.user_id = v_uid and s.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Trop de signalements envoyés. Réessayez plus tard.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: only status / admin_note are grantable; stamp who handled it
  if new.status is distinct from old.status or new.admin_note is distinct from old.admin_note then
    new.handled_by := v_uid;
    new.handled_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.ef_signalements_guard() from public, anon, authenticated;

drop trigger if exists trg_signalements_guard on public.signalements;
create trigger trg_signalements_guard
  before insert or update on public.signalements
  for each row execute function public.ef_signalements_guard();
