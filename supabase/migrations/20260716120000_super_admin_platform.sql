-- Super admin platform tables
alter table public.ecoles
  add column if not exists plan text default 'essai',
  add column if not exists billing_status text default 'trial',
  add column if not exists subscription_ends_at timestamptz;

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  invite_site_url text not null default 'https://edufaso.lovable.app',
  app_name text not null default 'EduFaso',
  support_email text,
  default_year_label text default '2025-2026',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profils(id)
);

insert into public.platform_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profils(id),
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

alter table public.platform_settings enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists ef_platform_settings_super on public.platform_settings;
create policy ef_platform_settings_super on public.platform_settings for all to authenticated
  using (public.ef_is_super_admin())
  with check (public.ef_is_super_admin());

drop policy if exists ef_audit_logs_super_select on public.audit_logs;
create policy ef_audit_logs_super_select on public.audit_logs for select to authenticated
  using (public.ef_is_super_admin());

drop policy if exists ef_audit_logs_super_insert on public.audit_logs;
create policy ef_audit_logs_super_insert on public.audit_logs for insert to authenticated
  with check (public.ef_is_super_admin() and actor_id = auth.uid());

grant select, insert, update, delete on public.platform_settings to authenticated;
grant select, insert on public.audit_logs to authenticated;
