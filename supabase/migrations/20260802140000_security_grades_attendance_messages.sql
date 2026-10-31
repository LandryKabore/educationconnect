-- Security hardening 5/6: teacher / student / parent data integrity.
--
-- F-01 (notes, presences, evaluations), F-08, F-09, F-18, T-04, T-05, T-06,
-- T-07, T-08, T-10, student-parent B7 + B8.
--
--  * notes / presences / evaluations: school admins are bound to the class's
--    school; teachers must teach THAT SUBJECT in THAT CLASS, may only grade
--    students enrolled in the class, and cannot spoof recorded_by / teacher_id.
--  * evaluations: teachers cannot create/convert compositions nor confirm their
--    own exams; students and parents only see confirmed evaluations.
--  * presences: teachers cannot overwrite an administrator's "excused".
--  * messages: sender/recipient must belong to the message's school; a
--    recipient can only change read_at.
--  * range CHECKs on scores (NOT VALID so legacy rows are left alone).

-- =============================================================== notes ======
drop policy if exists ef_notes_select on public.notes;
drop policy if exists ef_notes_write on public.notes;
drop policy if exists ef_notes_write_admin on public.notes;
drop policy if exists ef_notes_write_teacher on public.notes;

create policy ef_notes_select on public.notes for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = notes.student_id
    )
  );

create policy ef_notes_write_admin on public.notes for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_student_in_class(student_id, class_section_id)
      and public.ef_subject_in_class_school(class_section_id, subject_id)
    )
  );

create policy ef_notes_write_teacher on public.notes for all to authenticated
  using (public.ef_user_teaches_class_subject(class_section_id, subject_id))
  with check (
    public.ef_user_teaches_class_subject(class_section_id, subject_id)
    and public.ef_student_in_class(student_id, class_section_id)
  );

-- ============================================================ presences =====
drop policy if exists ef_presences_select on public.presences;
drop policy if exists ef_presences_write on public.presences;
drop policy if exists ef_presences_write_admin on public.presences;
drop policy if exists ef_presences_write_teacher on public.presences;

create policy ef_presences_select on public.presences for select to authenticated
  using (
    student_id = auth.uid()
    or recorded_by = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    or exists (
      select 1 from public.liens_parent_eleve l
      where l.parent_id = auth.uid() and l.student_id = presences.student_id
    )
  );

create policy ef_presences_write_admin on public.presences for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_student_in_class(student_id, class_section_id)
      and public.ef_subject_in_class_school(class_section_id, subject_id)
    )
  );

create policy ef_presences_write_teacher on public.presences for all to authenticated
  using (public.ef_user_teaches_class_subject(class_section_id, subject_id))
  with check (
    public.ef_user_teaches_class_subject(class_section_id, subject_id)
    and public.ef_student_in_class(student_id, class_section_id)
  );

-- ========================================================== evaluations =====
-- Drop every earlier name (this file also supersedes the split done by
-- 20260801130000 if that migration was applied).
drop policy if exists ef_evaluations_select on public.evaluations;
drop policy if exists ef_evaluations_write on public.evaluations;
drop policy if exists ef_evaluations_write_admin on public.evaluations;
drop policy if exists ef_evaluations_write_teacher on public.evaluations;

create policy ef_evaluations_select on public.evaluations for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.ef_is_super_admin()
    or public.ef_is_school_admin_of_class(class_section_id)
    or public.ef_user_teaches_class(class_section_id)
    -- students / parents: confirmed evaluations only (B7)
    or (
      admin_confirmed = true
      and (
        public.ef_user_enrolled_in_class(class_section_id)
        or public.ef_user_parent_of_student_in_class(class_section_id)
      )
    )
  );

create policy ef_evaluations_write_admin on public.evaluations for all to authenticated
  using (public.ef_is_super_admin() or public.ef_is_school_admin_of_class(class_section_id))
  with check (
    public.ef_is_super_admin()
    or (
      public.ef_is_school_admin_of_class(class_section_id)
      and public.ef_subject_in_class_school(class_section_id, subject_id)
    )
  );

-- Teachers: own evaluations only, for a subject they teach in that class,
-- never compositions (which are an administration workflow).
create policy ef_evaluations_write_teacher on public.evaluations for all to authenticated
  using (
    teacher_id = auth.uid()
    and type <> 'composition'
    and public.ef_user_teaches_class_subject(class_section_id, subject_id)
  )
  with check (
    teacher_id = auth.uid()
    and type <> 'composition'
    and public.ef_user_teaches_class_subject(class_section_id, subject_id)
  );

-- ====================================================== guard triggers ======
-- "Administrator" for these triggers: service role / SQL (auth.uid() null),
-- super admin, or school admin of the row's school.
create or replace function public.ef_is_admin_for_class_or_service(_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or public.ef_is_super_admin()
      or public.ef_is_school_admin_of_class(_class_id);
$$;
revoke all on function public.ef_is_admin_for_class_or_service(uuid) from public, anon;
grant execute on function public.ef_is_admin_for_class_or_service(uuid) to authenticated, service_role;

-- T-05: a teacher cannot confirm their own exam, and any teacher change to an
-- exam's date/time sends it back to "to confirm".
create or replace function public.ef_guard_evaluations_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.ef_is_admin_for_class_or_service(new.class_section_id) then
    return new;
  end if;

  if new.type = 'examen' then
    if tg_op = 'INSERT' or old.type is distinct from 'examen' then
      new.admin_confirmed := false;
    elsif old.admin_confirmed is false and new.admin_confirmed is true then
      raise exception 'Seule l''administration peut confirmer un examen'
        using errcode = '42501';
    elsif new.eval_date is distinct from old.eval_date
       or new.start_time is distinct from old.start_time
       or new.end_time is distinct from old.end_time then
      new.admin_confirmed := false;
    end if;
  end if;

  -- confirmation metadata is administration-only
  if tg_op = 'INSERT' then
    new.confirmed_at := null;
    new.confirmed_by := null;
  else
    new.confirmed_at := old.confirmed_at;
    new.confirmed_by := old.confirmed_by;
  end if;
  if new.admin_confirmed is false then
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evaluations_guard_confirmation on public.evaluations;
create trigger trg_evaluations_guard_confirmation
  before insert or update on public.evaluations
  for each row execute function public.ef_guard_evaluations_confirmation();

-- T-06: for teachers, recorded_by is always the authenticated user (no
-- spoofing a colleague / administrator as the author).
create or replace function public.ef_force_recorded_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.ef_is_admin_for_class_or_service(new.class_section_id) then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notes_force_recorded_by on public.notes;
create trigger trg_notes_force_recorded_by
  before insert or update on public.notes
  for each row execute function public.ef_force_recorded_by();

drop trigger if exists trg_presences_force_recorded_by on public.presences;
create trigger trg_presences_force_recorded_by
  before insert or update on public.presences
  for each row execute function public.ef_force_recorded_by();

-- T-10: only administration may change or remove an "excused" absence.
create or replace function public.ef_guard_presences_excused()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'excused'
     and new.status is distinct from old.status
     and not public.ef_is_admin_for_class_or_service(new.class_section_id) then
    raise exception 'Une absence justifiée ne peut être modifiée que par l''administration'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_presences_guard_excused on public.presences;
create trigger trg_presences_guard_excused
  before update on public.presences
  for each row execute function public.ef_guard_presences_excused();

-- ================================================ value sanity (T-01/T-08) ==
-- NOT VALID: existing rows are not re-checked, new / updated rows are.
alter table public.notes drop constraint if exists notes_score_range;
alter table public.notes
  add constraint notes_score_range
  check (max_score > 0 and score >= 0 and score <= max_score) not valid;

alter table public.evaluations drop constraint if exists evaluations_max_score_positive;
alter table public.evaluations
  add constraint evaluations_max_score_positive
  check (max_score > 0) not valid;

-- ============================================================== messages ====
drop policy if exists ef_messages_insert on public.messages;
drop policy if exists ef_messages_update on public.messages;

-- F-09: both ends must belong to the message's school (platform support
-- messages from a super admin are unrestricted).
create policy ef_messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.ef_is_super_admin()
      or (
        public.ef_user_in_school(auth.uid(), school_id)
        and public.ef_user_in_school(recipient_id, school_id)
      )
    )
  );

create policy ef_messages_update on public.messages for update to authenticated
  using (recipient_id = auth.uid() or sender_id = auth.uid())
  with check (recipient_id = auth.uid() or sender_id = auth.uid());

-- ...and the only thing a participant may change is read_at.
create or replace function public.ef_guard_messages_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.ef_is_super_admin() then
    if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
      raise exception 'Seule la date de lecture d''un message peut être modifiée'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_guard_update on public.messages;
create trigger trg_messages_guard_update
  before update on public.messages
  for each row execute function public.ef_guard_messages_update();
