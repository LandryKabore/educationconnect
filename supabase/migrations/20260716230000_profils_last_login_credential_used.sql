alter table public.profils
  add column if not exists last_login_at timestamptz;

comment on column public.profils.last_login_at is 'Dernière connexion réussie';

-- When a user finishes changing their password, mark temp credentials as used.
create or replace function public.ef_mark_temp_credential_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.must_change_password is true and new.must_change_password is false then
    update public.identifiants_temporaires
      set used = true
      where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profils_mark_temp_used on public.profils;
create trigger trg_profils_mark_temp_used
  after update of must_change_password on public.profils
  for each row
  execute function public.ef_mark_temp_credential_used();
