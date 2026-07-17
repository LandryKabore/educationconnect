-- Allow users to read profiles of people who share a school with them
-- (needed so message sender/recipient names resolve for students, teachers, parents).

create or replace function public.ef_shares_school_with(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles_utilisateurs a
    join public.roles_utilisateurs b
      on a.school_id = b.school_id
    where a.user_id = auth.uid()
      and b.user_id = _user_id
      and a.active = true
      and b.active = true
      and a.school_id is not null
  );
$$;

grant execute on function public.ef_shares_school_with(uuid) to authenticated;

drop policy if exists ef_profils_select on public.profils;

create policy ef_profils_select on public.profils for select to authenticated
  using (
    id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin()
    or public.ef_shares_school_with(id)
  );
