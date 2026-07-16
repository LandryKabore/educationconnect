-- Allow school admins to update their own school profile (not create/delete)
create policy ef_ecoles_school_admin_update on public.ecoles
  for update to authenticated
  using (public.ef_is_school_admin(id))
  with check (public.ef_is_school_admin(id));
