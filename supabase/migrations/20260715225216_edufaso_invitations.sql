-- Invitations table (email invite flow for school admins / teachers / parents)
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique,
  role public.ef_app_role not null default 'school_admin',
  school_id uuid references public.ecoles(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  invited_by uuid references public.profils(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_token_idx on public.invitations(token);
create index if not exists invitations_email_idx on public.invitations(email);

alter table public.invitations enable row level security;

drop policy if exists ef_invitations_admin on public.invitations;
create policy ef_invitations_admin on public.invitations for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin(school_id))
  with check (public.ef_is_super_admin() or public.ef_is_school_admin(school_id));

grant select, insert, update, delete on public.invitations to authenticated;
