-- Statistiques: the page timed out for a school of ~2 000 pupils (18 s, over the 8 s limit of
-- signed-in requests) and then said « Aucune année scolaire n'est définie ». Each step is now
-- computed once (materialized) instead of being re-run for every pupil: same result, ~1 s.

CREATE OR REPLACE FUNCTION public.ef_school_statistics(p_school uuid, p_year uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_year public.annees_scolaires%rowtype;
  v_periods text[] := array['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  if not (public.ef_is_super_admin() or p_school in (select public.ef_my_admin_school_ids())) then
    raise exception 'Accès non autorisé' using errcode = '42501';
  end if;

  select * into v_year from public.annees_scolaires a
   where a.school_id = p_school and (a.id = p_year or (p_year is null and a.is_current))
   order by a.start_date desc limit 1;
  if not found then
    return jsonb_build_object('year', null);
  end if;

  with cls as materialized (
    select c.id, c.name, c.grade_level as grade
    from public.classes c where c.school_id = p_school and c.academic_year_id = v_year.id
  ),
  stu as materialized (   -- one row per active student of the year
    select i.student_id, cls.id as class_id, cls.name as class_name, cls.grade as grade,
           case when p.gender in ('M', 'F') then p.gender else '?' end as sex,
           case when p.date_of_birth is null then null
                else date_part('year', age(v_year.start_date, p.date_of_birth))::int end as age_at_start
    from public.inscriptions i
    join cls on cls.id = i.class_section_id
    join public.profils p on p.id = i.student_id
    where i.status = 'active' and i.academic_year_id = v_year.id
  ),
  gen as materialized (   -- per student, per trimester general average (same function as the bulletins)
    select cls.id as class_id, g.student_id, g.general_avg
    from cls
    cross join lateral public.ef_student_period_generals(cls.id, v_periods, null) g
  ),
  ann as materialized (
    select s.student_id, s.class_id, s.grade, s.sex, avg(gen.general_avg) as avg20
    from stu s join gen on gen.student_id = s.student_id and gen.class_id = s.class_id   -- grades of the class the pupil is in NOW
    group by s.student_id, s.class_id, s.grade, s.sex
  ),
  att as materialized (
    select pr.class_section_id as class_id,
           count(*) as n,
           count(*) filter (where pr.status = 'absent') as absent,
           count(*) filter (where pr.status = 'late') as late,
           count(*) filter (where pr.status = 'excused') as excused
    from public.presences pr
    where pr.class_section_id in (select id from cls)
      and pr.date between v_year.start_date and v_year.end_date
    group by pr.class_section_id
  ),
  dep as materialized (
    select i.exit_reason, case when p.gender in ('M', 'F') then p.gender else '?' end as sex
    from public.inscriptions i
    join cls on cls.id = i.class_section_id
    join public.profils p on p.id = i.student_id
    where i.status = 'sorti' and i.academic_year_id = v_year.id
  ),
  by_class as materialized (
    select cls.id, cls.name, cls.grade,
           (select count(*) from stu where stu.class_id = cls.id) as total,
           (select count(*) from stu where stu.class_id = cls.id and sex = 'M') as m,
           (select count(*) from stu where stu.class_id = cls.id and sex = 'F') as f,
           (select count(*) from stu where stu.class_id = cls.id and sex = '?') as u,
           coalesce(att.n, 0) as att_n, coalesce(att.absent, 0) as att_abs, coalesce(att.late, 0) as att_late,
           coalesce(att.excused, 0) as att_exc,
           (select count(*) from ann where ann.class_id = cls.id) as graded,
           (select count(*) from ann where ann.class_id = cls.id and ann.avg20 >= 10) as passed,
           (select round(avg(ann.avg20), 2) from ann where ann.class_id = cls.id) as avg20
    from cls left join att on att.class_id = cls.id
  ),
  by_level as (
    select grade,
           count(*) filter (where true) as classes,
           sum(total) as total, sum(m) as m, sum(f) as f, sum(u) as u,
           sum(graded) as graded, sum(passed) as passed,
           (select count(*) from ann where ann.grade = bc.grade and ann.sex = 'M') as graded_m,
           (select count(*) from ann where ann.grade = bc.grade and ann.sex = 'M' and ann.avg20 >= 10) as passed_m,
           (select count(*) from ann where ann.grade = bc.grade and ann.sex = 'F') as graded_f,
           (select count(*) from ann where ann.grade = bc.grade and ann.sex = 'F' and ann.avg20 >= 10) as passed_f,
           (select round(avg(ann.avg20), 2) from ann where ann.grade = bc.grade) as avg20
    from by_class bc group by grade
  )
  select jsonb_build_object(
    'year', jsonb_build_object('id', v_year.id, 'label', v_year.label, 'startDate', v_year.start_date,
                               'endDate', v_year.end_date, 'isCurrent', v_year.is_current),
    'totals', jsonb_build_object(
      'students', (select count(*) from stu),
      'male', (select count(*) from stu where sex = 'M'),
      'female', (select count(*) from stu where sex = 'F'),
      'unknownSex', (select count(*) from stu where sex = '?'),
      'unknownBirth', (select count(*) from stu where age_at_start is null),
      'classes', (select count(*) from cls)),
    'byClass', coalesce((select jsonb_agg(jsonb_build_object(
        'classId', id, 'name', name, 'grade', grade, 'total', total, 'male', m, 'female', f, 'unknownSex', u,
        'attendanceRecords', att_n, 'absent', att_abs, 'late', att_late, 'excused', att_exc,
        'graded', graded, 'passed', passed, 'average', avg20) order by grade, name) from by_class), '[]'::jsonb),
    'byLevel', coalesce((select jsonb_agg(jsonb_build_object(
        'grade', grade, 'classes', classes, 'total', total, 'male', m, 'female', f, 'unknownSex', u,
        'graded', graded, 'passed', passed, 'average', avg20,
        'gradedMale', graded_m, 'passedMale', passed_m, 'gradedFemale', graded_f, 'passedFemale', passed_f)
        order by grade) from by_level), '[]'::jsonb),
    'ages', coalesce((select jsonb_agg(jsonb_build_object('age', a, 'male', m, 'female', f, 'unknownSex', u) order by a)
        from (select age_at_start as a, count(*) filter (where sex = 'M') as m, count(*) filter (where sex = 'F') as f,
                     count(*) filter (where sex = '?') as u
              from stu where age_at_start is not null group by age_at_start) x), '[]'::jsonb),
    'departures', jsonb_build_object(
      'total', (select count(*) from dep),
      'male', (select count(*) from dep where sex = 'M'),
      'female', (select count(*) from dep where sex = 'F'),
      'unknownSex', (select count(*) from dep where sex = '?'),
      'byReason', coalesce((select jsonb_object_agg(r, n) from (select exit_reason as r, count(*) as n from dep group by 1) z), '{}'::jsonb)),
    'attendance', jsonb_build_object(
      'records', (select coalesce(sum(att_n), 0) from by_class),
      'absent', (select coalesce(sum(att_abs), 0) from by_class),
      'late', (select coalesce(sum(att_late), 0) from by_class),
      'excused', (select coalesce(sum(att_exc), 0) from by_class)),
    'results', jsonb_build_object(
      'graded', (select count(*) from ann),
      'passed', (select count(*) from ann where avg20 >= 10),
      'gradedMale', (select count(*) from ann where sex = 'M'),
      'passedMale', (select count(*) from ann where sex = 'M' and avg20 >= 10),
      'gradedFemale', (select count(*) from ann where sex = 'F'),
      'passedFemale', (select count(*) from ann where sex = 'F' and avg20 >= 10),
      'average', (select round(avg(avg20), 2) from ann))
  ) into v_out;
  return v_out;
end $function$

;
