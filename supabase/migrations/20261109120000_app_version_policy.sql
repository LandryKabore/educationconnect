-- Idea 45: desktop (bureau) and Android update check, with a minimum supported version.
-- Prepared for review. NOT applied to any live database.
--
--  * platform_settings gains the latest version and the download link for bureau and Android,
--    plus one minimum supported version. Empty values mean "no rule".
--  * ef_app_version_policy() returns only those public fields (not the rest of the settings row)
--    to anon and authenticated, so the check can run before login. It fails open in the app
--    when this function is missing or the device is offline.
--  * Raising min_supported_version writes raise_min_supported_version in audit_logs.
--  * ef_signalements_par_version() counts reports per version. RLS still applies (security invoker).
-- There is no auto-update server and no silent install in this version.

alter table public.platform_settings
  add column if not exists latest_version_bureau text,
  add column if not exists latest_version_android text,
  add column if not exists min_supported_version text,
  add column if not exists download_url_bureau text,
  add column if not exists download_url_android text;

alter table public.platform_settings drop constraint if exists platform_settings_latest_bureau_fmt;
alter table public.platform_settings
  add constraint platform_settings_latest_bureau_fmt
  check (latest_version_bureau is null or latest_version_bureau ~ '^[0-9]+(\.[0-9]+){0,3}$');

alter table public.platform_settings drop constraint if exists platform_settings_latest_android_fmt;
alter table public.platform_settings
  add constraint platform_settings_latest_android_fmt
  check (latest_version_android is null or latest_version_android ~ '^[0-9]+(\.[0-9]+){0,3}$');

alter table public.platform_settings drop constraint if exists platform_settings_min_version_fmt;
alter table public.platform_settings
  add constraint platform_settings_min_version_fmt
  check (min_supported_version is null or min_supported_version ~ '^[0-9]+(\.[0-9]+){0,3}$');

alter table public.platform_settings drop constraint if exists platform_settings_download_bureau_fmt;
alter table public.platform_settings
  add constraint platform_settings_download_bureau_fmt
  check (
    download_url_bureau is null
    or (
      char_length(download_url_bureau) between 8 and 500
      and download_url_bureau ~* '^https?://[^[:space:]]+$'
    )
  );

alter table public.platform_settings drop constraint if exists platform_settings_download_android_fmt;
alter table public.platform_settings
  add constraint platform_settings_download_android_fmt
  check (
    download_url_android is null
    or (
      char_length(download_url_android) between 8 and 500
      and download_url_android ~* '^https?://[^[:space:]]+$'
    )
  );

-- True when a is strictly newer than b. A first non-empty value counts as a raise.
create or replace function public.ef_version_is_newer(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  pa text[];
  pb text[];
  n int;
  i int;
  da int;
  db int;
begin
  if a is null or btrim(a) = '' then
    return false;
  end if;
  if b is null or btrim(b) = '' then
    return true;
  end if;

  pa := string_to_array(btrim(a), '.');
  pb := string_to_array(btrim(b), '.');
  n := greatest(coalesce(array_length(pa, 1), 0), coalesce(array_length(pb, 1), 0));
  if n = 0 then
    return false;
  end if;

  for i in 1..n loop
    da := case when pa[i] ~ '^[0-9]+$' then pa[i]::int else 0 end;
    db := case when pb[i] ~ '^[0-9]+$' then pb[i]::int else 0 end;
    if da > db then
      return true;
    end if;
    if da < db then
      return false;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.ef_version_is_newer(text, text) from public, anon, authenticated;

create or replace function public.ef_platform_settings_audit_min_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.ef_version_is_newer(new.min_supported_version, old.min_supported_version) then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      'raise_min_supported_version',
      'platform_settings',
      '1',
      jsonb_build_object(
        'previous', old.min_supported_version,
        'minimum', new.min_supported_version
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.ef_platform_settings_audit_min_version() from public, anon, authenticated;

drop trigger if exists trg_platform_settings_audit_min_version on public.platform_settings;
create trigger trg_platform_settings_audit_min_version
  after update of min_supported_version on public.platform_settings
  for each row
  execute function public.ef_platform_settings_audit_min_version();

create or replace function public.ef_app_version_policy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'min_supported_version', s.min_supported_version,
    'bureau', jsonb_build_object(
      'latest', s.latest_version_bureau,
      'download_url', s.download_url_bureau
    ),
    'android', jsonb_build_object(
      'latest', s.latest_version_android,
      'download_url', s.download_url_android
    )
  )
  from public.platform_settings s
  where s.id = 1;
$$;

revoke all on function public.ef_app_version_policy() from public;
grant execute on function public.ef_app_version_policy() to anon, authenticated, service_role;

create index if not exists signalements_app_version_idx
  on public.signalements (app_version);

create or replace function public.ef_signalements_par_version()
returns table (app_version text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(nullif(btrim(s.app_version), ''), ''),
         count(*)::bigint
  from public.signalements s
  group by 1
  order by count(*) desc, 1 asc;
$$;

revoke all on function public.ef_signalements_par_version() from public;
grant execute on function public.ef_signalements_par_version() to authenticated, service_role;
