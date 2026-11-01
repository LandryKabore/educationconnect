-- EduFaso scale pack, part 4: read-only helper functions ("RPCs") for big schools.
--
-- Every function here is SECURITY INVOKER: it runs as the calling user, so the row-level
-- security policies (the ones you already have, plus the faster versions from part 3)
-- still decide what each person can see.  Nothing here can read or write more than the
-- caller could already read with a normal query.  They are all STABLE and read-only.
--
-- Why they exist:
--   * the API never returns more than 1,000 rows, so lists and counts that were computed
--     in the browser were silently cut off.  A function that returns ONE json value is not
--     subject to that cap, and counts are done by the database instead.
--   * pages with search + "page N" ask the database for just one page.

create or replace function public.ef_norm(t text)
returns text
language sql immutable parallel safe
set search_path = pg_catalog
as $$
  -- lower-case and remove French accents, like matchesSearch() in the app
  select lower(translate(coalesce(t, ''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy'))
$$;

create or replace function public.ef_match(hay text, q text)
returns boolean
language sql immutable parallel safe
set search_path = public, pg_catalog
as $$
  -- every word typed in the search box must appear somewhere in the text
  select not exists (
    select 1
    from unnest(string_to_array(public.ef_norm(btrim(q)), ' ')) as tok
    where tok <> '' and position(tok in public.ef_norm(hay)) = 0
  )
$$;

create or replace function public.ef_programme_counts(p_school uuid)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(class_section_id, n), '{}'::jsonb)
  from (
    select pc.class_section_id, count(*) n
    from programme_classe pc
    join classes c on c.id = pc.class_section_id and c.school_id = p_school
    group by pc.class_section_id) t
$$;

create or replace function public.ef_school_setup_counts(p_school uuid)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'classesWithProgramme', (select count(distinct pc.class_section_id) from programme_classe pc
                             join classes c on c.id = pc.class_section_id and c.school_id = p_school),
    'enrollments', (select count(*) from inscriptions i join classes c on c.id = i.class_section_id
                    where c.school_id = p_school and i.status = 'active'),
    'assignments', (select count(*) from affectations_enseignement a join classes c on c.id = a.class_section_id
                    where c.school_id = p_school),
    'timetableSlots', (select count(*) from creneaux_edt cr join classes c on c.id = cr.class_section_id
                       where c.school_id = p_school))
$$;

-- ---------------------------------------------------------------- school-level numbers

create or replace function public.ef_students_without_class(p_school uuid, p_sample int default 6)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with s as (
    select p.id, p.first_name, p.last_name
    from roles_utilisateurs r
    join profils p on p.id = r.user_id
    where r.school_id = p_school and r.role = 'student' and r.active
      and not exists (
        select 1 from inscriptions i
        join classes c on c.id = i.class_section_id
        where i.student_id = r.user_id and i.status = 'active' and c.school_id = p_school)
  )
  select jsonb_build_object(
    'count', (select count(*) from s),
    'sample', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', btrim(x.first_name || ' ' || x.last_name))
                       order by ef_norm(x.first_name || ' ' || x.last_name), x.id)
      from (select * from s order by ef_norm(first_name || ' ' || last_name), id
            limit greatest(coalesce(p_sample, 0), 0)) x
      where btrim(x.first_name || ' ' || x.last_name) <> ''), '[]'::jsonb))
$$;

create or replace function public.ef_class_student_counts(p_school uuid)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(class_section_id, n), '{}'::jsonb)
  from (
    select i.class_section_id, count(*) n
    from inscriptions i
    join classes c on c.id = i.class_section_id and c.school_id = p_school
    join roles_utilisateurs r on r.user_id = i.student_id and r.school_id = p_school
                              and r.role = 'student' and r.active
    where i.status = 'active'
    group by i.class_section_id
  ) t
$$;

create or replace function public.ef_attendance_day_summary(p_school uuid, p_date date, p_class uuid default null)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'present', count(*) filter (where pr.status = 'present'),
    'absent',  count(*) filter (where pr.status = 'absent'),
    'late',    count(*) filter (where pr.status = 'late'),
    'excused', count(*) filter (where pr.status = 'excused'),
    'total',   count(*))
  from presences pr
  join classes c on c.id = pr.class_section_id and c.school_id = p_school
  where pr.date = p_date and (p_class is null or pr.class_section_id = p_class)
$$;

create or replace function public.ef_school_home_stats(p_school uuid, p_date date, p_dow int)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with att as (
    select
      count(*) filter (where pr.status = 'absent')  as absent,
      count(*) filter (where pr.status = 'late')    as late,
      count(*) filter (where pr.status = 'excused') as excused
    from presences pr
    join classes c on c.id = pr.class_section_id and c.school_id = p_school
    where pr.date = p_date
  ),
  slots as (
    select c.id, c.name,
           count(cr.id) as n_slots,
           count(cr.id) filter (where cr.day_of_week = p_dow) as n_today
    from classes c
    left join creneaux_edt cr on cr.class_section_id = c.id
    where c.school_id = p_school
    group by c.id, c.name
  )
  select jsonb_build_object(
    'absent',  (select absent  from att),
    'late',    (select late    from att),
    'excused', (select excused from att),
    'classesWithEdt',  (select count(*) from slots where n_slots > 0),
    'todaySlotCount',  (select coalesce(sum(n_today), 0) from slots),
    'classesWithoutEdt', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.name, x.id)
        from (select id, name from slots where n_slots = 0 order by name, id limit 5) x), '[]'::jsonb),
    'studentsWithoutClass', public.ef_students_without_class(p_school, 6))
$$;

-- ---------------------------------------------------------------- paged lists

create or replace function public.ef_students_page(
  p_school uuid, p_class text default '', p_search text default '',
  p_limit int default 100, p_offset int default 0)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select p.*,
           e.class_section_id as _class_id, e.class_name as _class_name,
           it.username as _cred_username, it.temp_password_hint as _cred_hint, it.used as _cred_used,
           it.user_id as _cred_user
    from roles_utilisateurs r
    join profils p on p.id = r.user_id
    left join lateral (
      select i.class_section_id, c.name as class_name
      from inscriptions i
      join classes c on c.id = i.class_section_id and c.school_id = p_school
      where i.student_id = p.id and i.status = 'active'
      order by i.created_at desc, i.id limit 1) e on true
    left join lateral (
      select t.user_id, t.username, t.temp_password_hint, t.used
      from identifiants_temporaires t
      where t.user_id = p.id order by t.created_at desc, t.id limit 1) it on true
    where r.school_id = p_school and r.role = 'student' and r.active
      and case
            when coalesce(p_class, '') = '' then true
            when p_class = '__none__' then e.class_section_id is null
            else e.class_section_id::text = p_class
          end
      and (coalesce(btrim(p_search), '') = ''
           or ef_match(concat_ws(' ', p.first_name, p.last_name, e.class_name, p.phone, p.matricule,
                                 coalesce(it.username, split_part(coalesce(p.email, ''), '@', 1))),
                       p_search))
  ),
  pg as (
    select * from f
    order by ef_norm(first_name || ' ' || last_name), id
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(pg) - '_class_id' - '_class_name' - '_cred_username' - '_cred_hint' - '_cred_used' - '_cred_user')
        || jsonb_build_object(
             'className', pg._class_name,
             'classSectionId', pg._class_id,
             'cred', case when pg._cred_user is null then null else
                       jsonb_build_object('username', pg._cred_username,
                                          'tempPassword', pg._cred_hint,
                                          'used', coalesce(pg._cred_used, false)) end)
        order by ef_norm(pg.first_name || ' ' || pg.last_name), pg.id)
      from pg), '[]'::jsonb))
$$;

create or replace function public.ef_parents_page(
  p_school uuid, p_search text default '', p_limit int default 100, p_offset int default 0)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select p.*,
           k.names as _children,
           it.username as _cred_username, it.temp_password_hint as _cred_hint, it.used as _cred_used,
           it.user_id as _cred_user
    from roles_utilisateurs r
    join profils p on p.id = r.user_id
    left join lateral (
      select coalesce(jsonb_agg(btrim(sp.first_name || ' ' || sp.last_name)
                                order by ef_norm(sp.first_name || ' ' || sp.last_name), sp.id)
                      filter (where btrim(sp.first_name || ' ' || sp.last_name) <> ''), '[]'::jsonb) as names
      from liens_parent_eleve l
      join profils sp on sp.id = l.student_id
      where l.parent_id = p.id) k on true
    left join lateral (
      select t.user_id, t.username, t.temp_password_hint, t.used
      from identifiants_temporaires t
      where t.user_id = p.id order by t.created_at desc, t.id limit 1) it on true
    where r.school_id = p_school and r.role = 'parent' and r.active
      and (coalesce(btrim(p_search), '') = ''
           or ef_match(concat_ws(' ', p.first_name, p.last_name, p.phone,
                                 coalesce(it.username, split_part(coalesce(p.email, ''), '@', 1)),
                                 (select string_agg(x, ' ') from jsonb_array_elements_text(k.names) x)),
                       p_search))
  ),
  pg as (
    select * from f
    order by ef_norm(first_name || ' ' || last_name), id
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(pg) - '_children' - '_cred_username' - '_cred_hint' - '_cred_used' - '_cred_user')
        || jsonb_build_object(
             'children', pg._children,
             'cred', case when pg._cred_user is null then null else
                       jsonb_build_object('username', pg._cred_username,
                                          'tempPassword', pg._cred_hint,
                                          'used', coalesce(pg._cred_used, false)) end)
        order by ef_norm(pg.first_name || ' ' || pg.last_name), pg.id)
      from pg), '[]'::jsonb))
$$;

-- type-ahead used by the "link a student" box on the Parents page
create or replace function public.ef_student_picker(p_school uuid, p_search text default '', p_limit int default 40)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'first_name', x.first_name, 'last_name', x.last_name,
           'phone', x.phone, 'className', x.class_name)
         order by ef_norm(x.first_name || ' ' || x.last_name), x.id), '[]'::jsonb)
  from (
    select p.id, p.first_name, p.last_name, p.phone, e.class_name
    from roles_utilisateurs r
    join profils p on p.id = r.user_id
    left join lateral (
      select c.name as class_name
      from inscriptions i
      join classes c on c.id = i.class_section_id and c.school_id = p_school
      where i.student_id = p.id and i.status = 'active'
      order by i.created_at desc, i.id limit 1) e on true
    where r.school_id = p_school and r.role = 'student' and r.active
      and (coalesce(btrim(p_search), '') = ''
           or ef_match(concat_ws(' ', p.first_name, p.last_name, e.class_name, p.phone), p_search))
    order by ef_norm(p.first_name || ' ' || p.last_name), p.id
    limit greatest(least(coalesce(p_limit, 40), 200), 1)
  ) x
$$;

-- ---------------------------------------------------------------- super-admin users page

create or replace function public.ef_admin_users_page(
  p_role text, p_school uuid default null, p_class text default '', p_search text default '',
  p_limit int default 50, p_offset int default 0)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select p.*,
           coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
                     from roles_utilisateurs r where r.user_id = p.id), '[]'::jsonb) as _roles,
           coalesce((select jsonb_agg(distinct r.school_id) from roles_utilisateurs r
                     where r.user_id = p.id and r.active and r.school_id is not null), '[]'::jsonb) as _school_ids,
           coalesce((select jsonb_agg(distinct s.name) from roles_utilisateurs r
                     join ecoles s on s.id = r.school_id
                     where r.user_id = p.id and r.active), '[]'::jsonb) as _school_names,
           e.cid as _class_id, e.cname as _class_name, e.csid as _class_school
    from profils p
    left join lateral (
      select c.id as cid, c.name as cname, c.school_id as csid
      from inscriptions i join classes c on c.id = i.class_section_id
      where i.student_id = p.id and i.status = 'active'
      order by i.created_at desc, i.id limit 1) e on true
    where
      case
        when p_role = 'none' then not exists (select 1 from roles_utilisateurs r where r.user_id = p.id and r.active)
        else exists (select 1 from roles_utilisateurs r
                     where r.user_id = p.id and r.active and r.role::text = p_role
                       and (p_school is null or p_role not in ('school_admin', 'teacher', 'student')
                            or r.school_id = p_school))
      end
      and (p_role <> 'student' or coalesce(p_class, '') = ''
           or (p_class = '__none__' and e.cid is null)
           or e.cid::text = p_class)
      and (coalesce(btrim(p_search), '') = ''
           or ef_match(concat_ws(' ', p.first_name, p.last_name, p.email), p_search))
  ),
  pg as (
    select * from f
    order by ef_norm(first_name || ' ' || last_name), id
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(pg) - '_roles' - '_school_ids' - '_school_names' - '_class_id' - '_class_name' - '_class_school')
        || jsonb_build_object('roles', pg._roles, 'schoolIds', pg._school_ids, 'schoolNames', pg._school_names,
                              'classId', pg._class_id, 'className', pg._class_name, 'classSchoolId', pg._class_school)
        order by ef_norm(pg.first_name || ' ' || pg.last_name), pg.id)
      from pg), '[]'::jsonb))
$$;

create or replace function public.ef_admin_users_facets(p_role text, p_school uuid default null)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with active_roles as (
    select r.user_id, r.role::text as role, r.school_id from roles_utilisateurs r where r.active
  ),
  role_counts as (
    select role, count(distinct user_id) n from active_roles group by role
  ),
  none_count as (
    select count(*) n from profils p where not exists (select 1 from active_roles a where a.user_id = p.id)
  ),
  school_counts as (
    select a.school_id, count(distinct a.user_id) n
    from active_roles a
    where a.role = p_role and a.school_id is not null and p_role in ('school_admin', 'teacher', 'student')
    group by a.school_id
  ),
  stud as (
    select a.user_id, e.cid, e.cname, e.csid
    from active_roles a
    left join lateral (
      select c.id cid, c.name cname, c.school_id csid
      from inscriptions i join classes c on c.id = i.class_section_id
      where i.student_id = a.user_id and i.status = 'active'
      order by i.created_at desc, i.id limit 1) e on true
    where p_role = 'student' and a.role = 'student' and (p_school is null or a.school_id = p_school)
  )
  select jsonb_build_object(
    'roleCounts',
      coalesce((select jsonb_object_agg(role, n) from role_counts), '{}'::jsonb)
      || jsonb_build_object('none', (select n from none_count)),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'count', sc.n) order by s.name, s.id)
      from school_counts sc join ecoles s on s.id = sc.school_id), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.cid, 'name', t.cname, 'schoolId', t.csid, 'count', t.n)
                       order by t.cname, t.cid)
      from (select cid, cname, csid, count(distinct user_id) n from stud where cid is not null
            group by cid, cname, csid) t), '[]'::jsonb),
    'noClass', (select count(distinct user_id) from stud where cid is null))
$$;

-- ---------------------------------------------------------------- teacher / parent / student

create or replace function public.ef_teacher_class_stats(p_class_ids uuid[])
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(class_section_id, n) from (
        select i.class_section_id, count(*) n from inscriptions i
        where i.class_section_id = any (p_class_ids) and i.status = 'active'
        group by i.class_section_id) c), '{}'::jsonb),
    'averages', coalesce((
      select jsonb_agg(jsonb_build_object('classId', a.class_section_id, 'subjectId', a.subject_id,
                                          'avg', a.avg20, 'n', a.n))
      from (
        select n.class_section_id, n.subject_id,
               avg(case when n.max_score is null or n.max_score <= 0 then 0
                        else coalesce(n.score, 0) / n.max_score * 20 end) as avg20,
               count(*) as n
        from notes n
        where n.class_section_id = any (p_class_ids) and not coalesce(n.is_absent, false)
        group by n.class_section_id, n.subject_id) a), '[]'::jsonb))
$$;

create or replace function public.ef_my_children_summary()
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ch.id, 'first_name', ch.first_name, 'last_name', ch.last_name,
      'className', e.cname,
      'absences', (select count(*) from presences pr where pr.student_id = ch.id and pr.status = 'absent'),
      'notesCount', (select count(*) from notes n where n.student_id = ch.id),
      'recentNotes', coalesce((
         select jsonb_agg(jsonb_build_object('id', x.id, 'score', x.score, 'max_score', x.max_score,
                                             'period_label', x.period_label, 'created_at', x.created_at,
                                             'is_absent', x.is_absent, 'subject', x.sname)
                          order by x.created_at desc, x.id)
         from (select n.id, n.score, n.max_score, n.period_label, n.created_at, n.is_absent, m.name as sname
               from notes n left join matieres m on m.id = n.subject_id
               where n.student_id = ch.id order by n.created_at desc, n.id limit 5) x), '[]'::jsonb))
    order by l.created_at, l.id), '[]'::jsonb)
  from liens_parent_eleve l
  join profils ch on ch.id = l.student_id
  left join lateral (
    select c.name as cname from inscriptions i join classes c on c.id = i.class_section_id
    where i.student_id = ch.id and i.status = 'active' order by i.created_at desc, i.id limit 1) e on true
  where l.parent_id = (select auth.uid())
$$;

-- exact attendance numbers for one student (replaces "count the newest 120 rows in the browser")
create or replace function public.ef_attendance_counts(p_student uuid)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'present', count(*) filter (where status = 'present'),
    'absent',  count(*) filter (where status = 'absent'),
    'late',    count(*) filter (where status = 'late'),
    'excused', count(*) filter (where status = 'excused'),
    'total',   count(*),
    'bySubject', coalesce((
      select jsonb_agg(jsonb_build_object('subjectId', s.subject_id, 'name', s.name,
               'present', s.pr, 'absent', s.ab, 'late', s.la, 'excused', s.ex) order by s.name)
      from (select p.subject_id, coalesce(m.name, 'Matière') as name,
                   count(*) filter (where p.status = 'present') pr,
                   count(*) filter (where p.status = 'absent') ab,
                   count(*) filter (where p.status = 'late') la,
                   count(*) filter (where p.status = 'excused') ex
            from presences p left join matieres m on m.id = p.subject_id
            where p.student_id = p_student group by p.subject_id, m.name) s), '[]'::jsonb))
  from presences where student_id = p_student
$$;

-- ---------------------------------------------------------------- messages

-- Every person the caller can write to, in ONE json value (no 1,000-row cut-off).
-- Covers school admins/super admins (whole school) and teachers (their classes' students
-- and parents + school admins).  Parents and students keep using the small queries.
create or replace function public.ef_message_contacts(p_school uuid, p_role text)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with me as (select (select auth.uid()) as uid),
  admin_set as (
    select r.user_id as id, r.role::text as role, null::text as class_name
    from roles_utilisateurs r
    where r.school_id = p_school and r.active
      and r.role::text in ('student', 'parent', 'teacher', 'school_admin')
      and p_role in ('school_admin', 'super_admin')
  ),
  my_classes as (
    select distinct a.class_section_id from affectations_enseignement a, me
    where a.teacher_id = me.uid and p_role = 'teacher'
  ),
  t_students as (
    select i.student_id as id from inscriptions i
    where i.class_section_id in (select class_section_id from my_classes) and i.status = 'active'
  ),
  t_set as (
    select id, 'student'::text as role, null::text as class_name from t_students
    union all
    select l.parent_id, 'parent', null from liens_parent_eleve l where l.student_id in (select id from t_students)
    union all
    select r.user_id, 'school_admin', null from roles_utilisateurs r
    where r.school_id = p_school and r.role = 'school_admin' and r.active and p_role = 'teacher'
  ),
  allc as (
    select distinct on (u.id) u.id, u.role, u.class_name
    from (select *, 1 as pri from admin_set union all select *, 2 from t_set) u
    order by u.id, u.pri, case u.role when 'student' then 0 when 'parent' then 1 when 'teacher' then 2 else 3 end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'role', c.role,
      'class_name', case when c.role = 'student' then e.cname end, 'date_of_birth', p.date_of_birth)
    order by coalesce(e.cname, '') , ef_norm(p.first_name || ' ' || p.last_name), p.id), '[]'::jsonb)
  from allc c
  join profils p on p.id = c.id
  left join lateral (
    select cl.name as cname from inscriptions i join classes cl on cl.id = i.class_section_id
    where i.student_id = p.id and i.status = 'active' and c.role = 'student'
    order by i.created_at desc, i.id limit 1) e on true
  where p.id <> (select uid from me)
$$;

-- Announcements I sent, one line per announcement with the real number of recipients.
create or replace function public.ef_sent_announcements(p_limit int default 100)
returns jsonb
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(g.m) || jsonb_build_object('recipientCount', g.cnt) order by g.created desc), '[]'::jsonb)
  from (
    select (array_agg(m order by m.created_at, m.id))[1] as m,
           count(*) as cnt,
           min(m.created_at) as created
    from messages m
    where m.sender_id = (select auth.uid()) and m.is_announcement
    group by coalesce(m.announcement_id, m.id)
    order by min(m.created_at) desc
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
  ) g
$$;

-- ---------------------------------------------------------------- permissions

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'ef_norm','ef_match','ef_students_without_class','ef_class_student_counts','ef_attendance_day_summary',
      'ef_school_home_stats','ef_students_page','ef_parents_page','ef_student_picker','ef_admin_users_page',
      'ef_admin_users_facets','ef_teacher_class_stats','ef_my_children_summary','ef_attendance_counts',
      'ef_message_contacts','ef_sent_announcements','ef_programme_counts','ef_school_setup_counts')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
