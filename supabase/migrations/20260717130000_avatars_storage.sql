-- Compressed student/user avatars in Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  512000,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: avatars/{user_id}/avatar.jpg

drop policy if exists ef_avatars_select on storage.objects;
drop policy if exists ef_avatars_insert on storage.objects;
drop policy if exists ef_avatars_update on storage.objects;
drop policy if exists ef_avatars_delete on storage.objects;

create policy ef_avatars_select
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy ef_avatars_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or public.ef_is_school_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy ef_avatars_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or public.ef_is_school_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or public.ef_is_school_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy ef_avatars_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.ef_is_super_admin()
      or public.ef_is_school_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
