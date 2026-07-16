-- Distinguish cancelled invites from accepted ones
alter table public.invitations
  add column if not exists cancelled_at timestamptz;
