-- Exam scheduling: time window + school-admin confirmation.
alter table public.devoirs
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists admin_confirmed boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profils(id);

-- Housework stays display-only; confirmation only matters for examens.
-- Default existing examens to confirmed so past data stays visible.
update public.devoirs
set admin_confirmed = true,
    confirmed_at = coalesce(confirmed_at, created_at)
where kind = 'examen'
  and admin_confirmed = false
  and created_at < now();

create index if not exists devoirs_examen_confirm_idx
  on public.devoirs (kind, admin_confirmed, due_date);
