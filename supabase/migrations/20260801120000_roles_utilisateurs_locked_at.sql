-- Support "lock" deactivates a user's roles; mark them so "unlock" can restore
-- exactly those rows (and not roles that were revoked on purpose earlier).
alter table public.roles_utilisateurs
  add column if not exists locked_at timestamptz;

comment on column public.roles_utilisateurs.locked_at is
  'Set by support-user-action lock when it deactivates this role; cleared by unlock.';

-- Optional one-off backfill for users locked by the old function: none is
-- possible reliably (revoked vs locked roles are indistinguishable); the
-- function falls back to reactivating all roles if a user has no active role.
