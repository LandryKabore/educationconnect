-- App versions: when a new version comes out, people are told and asked to update.
--
-- A super admin publishes a version per platform (iPhone, Android, Windows, Mac, web) with its
-- « Nouveautés » and download link. Each app compares itself with the latest version of its
-- platform: older → « Mise à jour disponible » (or a required update below min_version);
-- just updated → « Nouveautés » once. With notify, everyone with the app gets a push.

create table if not exists public.app_releases (
  id           uuid primary key default gen_random_uuid(),
  platform     text not null check (platform in ('ios', 'android', 'windows', 'mac', 'web')),
  version      text not null check (version ~ '^\d+(\.\d+){0,3}$'),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  notes        text not null default '' check (char_length(notes) <= 4000),
  download_url text check (download_url is null or download_url ~ '^https?://'),
  -- older versions must update before going on (null = updating is optional)
  min_version  text check (min_version is null or min_version ~ '^\d+(\.\d+){0,3}$'),
  notify       boolean not null default false,
  published_at timestamptz not null default now(),
  published_by uuid references public.profils(id) on delete set null,
  unique (platform, version)
);
create index if not exists app_releases_platform on public.app_releases (platform, published_at desc);

alter table public.app_releases enable row level security;

-- everyone (also before signing in: the login screen can ask for the update)
drop policy if exists app_releases_select on public.app_releases;
create policy app_releases_select on public.app_releases for select to anon, authenticated using (true);
drop policy if exists app_releases_write on public.app_releases;
create policy app_releases_write on public.app_releases for all to authenticated
  using (public.ef_is_super_admin()) with check (public.ef_is_super_admin());

-- 1.10.0 > 1.9.2
create or replace function public.ef_version_parts(p text)
returns int[] language sql immutable as $$
  select array(select coalesce(nullif(x, '')::int, 0) from unnest(string_to_array(p, '.')) as x);
$$;

-- The latest version of each platform, with the highest minimum still in force.
create or replace function public.ef_latest_releases()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(platform, row), '{}'::jsonb) from (
    select distinct on (r.platform) r.platform, jsonb_build_object(
      'version', r.version, 'title', r.title, 'notes', r.notes, 'downloadUrl', r.download_url,
      'publishedAt', r.published_at,
      'minVersion', (select m.min_version from app_releases m where m.platform = r.platform and m.min_version is not null
                     order by ef_version_parts(m.min_version) desc limit 1)) as row
    from app_releases r
    order by r.platform, ef_version_parts(r.version) desc, r.published_at desc) z;
$$;
grant execute on function public.ef_latest_releases() to anon, authenticated;

-- « Nouveautés » of one version (shown once after updating).
create or replace function public.ef_release_notes(p_platform text, p_version text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', version, 'title', title, 'notes', notes)
    from app_releases where platform = p_platform and version = p_version;
$$;
grant execute on function public.ef_release_notes(text, text) to anon, authenticated;

-- With notify: a push to everyone with the app (iPhone tokens), « Nouveautés » switch in Profil.
create or replace function public.ef_push_on_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.notify or new.platform not in ('ios', 'web') then return new; end if;
  insert into ef_push_queue (user_id, kind, title, body, screen, ref, send_after)
  select distinct t.user_id, 'nouveautes',
         'Nouveautés · EduFaso ' || new.version,
         left(coalesce(nullif(btrim(new.title), ''), 'Une nouvelle version est disponible'), 200),
         'dashboard', 'release:' || new.id, now()
    from ef_push_tokens t
   where coalesce((select enabled from ef_push_prefs p where p.user_id = t.user_id and p.kind = 'nouveautes'), true);
  return new;
end $$;

drop trigger if exists ef_push_on_release on public.app_releases;
create trigger ef_push_on_release after insert on public.app_releases
  for each row execute function public.ef_push_on_release();

-- the versions shipped today
insert into public.app_releases (platform, version, title, notes, notify) values
  ('web', '1.2.0', 'Espace classe et notifications',
   E'• Espace classe (secondaire) : questions, fiches de révision, groupes de travail et compte à rebours des compositions.\n• Notifications sur iPhone pour les élèves, parents, enseignants et l’administration.\n• Toucher une notification ouvre directement la note, l’exercice ou le message concerné.\n• Statistiques plus rapides.', false),
  ('ios', '1.1', 'Espace classe et notifications',
   E'• Espace classe (secondaire) : questions, fiches de révision, groupes de travail et compte à rebours des compositions.\n• Notifications pour les élèves, parents, enseignants et l’administration.\n• Toucher une notification ouvre directement la note, l’exercice ou le message concerné.', false)
on conflict (platform, version) do nothing;
