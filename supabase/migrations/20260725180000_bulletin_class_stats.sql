-- Anonymized class statistics for bulletin PDFs.
-- Parents/students cannot SELECT classmates' notes (RLS); this SECURITY DEFINER
-- RPC returns only aggregates + the caller's child's averages/rank/écart.

create or replace function public.ef_can_view_student_bulletin(
  p_student_id uuid,
  p_class_section_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.classes c
      where c.id = p_class_section_id
    )
    and exists (
      select 1
      from public.inscriptions i
      where i.student_id = p_student_id
        and i.class_section_id = p_class_section_id
        and i.status = 'active'
    )
    and (
      auth.uid() = p_student_id
      or public.ef_is_super_admin()
      or public.ef_is_school_admin((
        select c.school_id from public.classes c where c.id = p_class_section_id
      ))
      or public.ef_user_teaches_class(p_class_section_id)
      or exists (
        select 1
        from public.liens_parent_eleve l
        where l.parent_id = auth.uid()
          and l.student_id = p_student_id
      )
    );
$$;

revoke all on function public.ef_can_view_student_bulletin(uuid, uuid) from public;
grant execute on function public.ef_can_view_student_bulletin(uuid, uuid) to authenticated;

create or replace function public.ef_bulletin_class_stats(
  p_student_id uuid,
  p_class_section_id uuid,
  p_period_label text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period text := trim(p_period_label);
  v_is_annual boolean;
  v_class_size int;
  v_year_label text;
  v_class_name text;
  v_result jsonb;
begin
  if p_student_id is null or p_class_section_id is null or v_period = '' then
    raise exception 'Paramètres bulletin invalides';
  end if;

  if not public.ef_can_view_student_bulletin(p_student_id, p_class_section_id) then
    raise exception 'Accès non autorisé au bulletin';
  end if;

  v_is_annual := v_period = 'Année';

  select c.name, a.label
  into v_class_name, v_year_label
  from public.classes c
  join public.annees_scolaires a on a.id = c.academic_year_id
  where c.id = p_class_section_id;

  select count(*)::int
  into v_class_size
  from public.inscriptions i
  where i.class_section_id = p_class_section_id
    and i.status = 'active';

  with
  periods as (
    select unnest(
      case
        when v_is_annual then array['Trimestre 1', 'Trimestre 2', 'Trimestre 3']
        else array[v_period]
      end
    ) as period_label
  ),
  note_avgs as (
    select
      n.student_id,
      n.subject_id,
      n.period_label,
      avg((n.score / nullif(n.max_score, 0)) * 20.0) as avg_on_20
    from public.notes n
    where n.class_section_id = p_class_section_id
      and n.is_absent = false
      and n.max_score > 0
      and n.period_label in (select period_label from periods)
    group by n.student_id, n.subject_id, n.period_label
  ),
  subject_student as (
    select
      student_id,
      subject_id,
      avg(avg_on_20) as avg_on_20
    from note_avgs
    group by student_id, subject_id
  ),
  coefs as (
    select
      ss.subject_id,
      coalesce(
        nullif(pc.coefficient, 0),
        nullif(m.coefficient, 0),
        1
      )::numeric as coefficient,
      m.name as subject_name
    from (select distinct subject_id from subject_student) ss
    join public.matieres m on m.id = ss.subject_id
    left join public.programme_classe pc
      on pc.class_section_id = p_class_section_id
     and pc.subject_id = ss.subject_id
  ),
  teachers as (
    select
      a.subject_id,
      string_agg(
        trim(both from concat_ws(' ', nullif(p.first_name, ''), nullif(p.last_name, ''))),
        ' / '
      ) as teacher_name
    from (
      select distinct teacher_id, subject_id
      from public.affectations_enseignement
      where class_section_id = p_class_section_id
    ) a
    join public.profils p on p.id = a.teacher_id
    group by a.subject_id
  ),
  subject_stats as (
    select
      ss.subject_id,
      c.subject_name,
      c.coefficient,
      t.teacher_name,
      avg(ss.avg_on_20) as class_avg,
      min(ss.avg_on_20) as class_min,
      max(ss.avg_on_20) as class_max,
      count(*)::int as ranked_count
    from subject_student ss
    join coefs c on c.subject_id = ss.subject_id
    left join teachers t on t.subject_id = ss.subject_id
    group by ss.subject_id, c.subject_name, c.coefficient, t.teacher_name
  ),
  subject_ranks as (
    select
      ss.student_id,
      ss.subject_id,
      ss.avg_on_20,
      rank() over (
        partition by ss.subject_id
        order by ss.avg_on_20 desc
      ) as rank
    from subject_student ss
  ),
  student_subjects as (
    select
      st.subject_id,
      st.subject_name,
      st.coefficient,
      st.teacher_name,
      sr.avg_on_20 as student_avg,
      st.class_avg,
      st.class_min,
      st.class_max,
      (sr.avg_on_20 - st.class_avg) as ecart,
      sr.rank,
      st.ranked_count
    from subject_ranks sr
    join subject_stats st on st.subject_id = sr.subject_id
    where sr.student_id = p_student_id
  ),
  student_general as (
    select
      ss.student_id,
      sum(ss.avg_on_20 * c.coefficient) / nullif(sum(c.coefficient), 0) as general_avg
    from subject_student ss
    join coefs c on c.subject_id = ss.subject_id
    group by ss.student_id
  ),
  general_stats as (
    select
      avg(general_avg) as class_avg,
      min(general_avg) as class_min,
      max(general_avg) as class_max,
      count(*)::int as ranked_count
    from student_general
  ),
  general_ranks as (
    select
      student_id,
      general_avg,
      rank() over (order by general_avg desc) as rank
    from student_general
  ),
  attendance as (
    select
      count(distinct p.date) filter (where p.status = 'absent')::int as absences,
      count(distinct p.date) filter (where p.status = 'late')::int as lates
    from public.presences p
    where p.student_id = p_student_id
      and p.class_section_id = p_class_section_id
  )
  select jsonb_build_object(
    'class_name', v_class_name,
    'year_label', v_year_label,
    'class_size', v_class_size,
    'period_label', v_period,
    'is_annual', v_is_annual,
    'subjects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'subject_id', s.subject_id,
            'subject_name', s.subject_name,
            'coefficient', s.coefficient,
            'teacher_name', nullif(s.teacher_name, ''),
            'student_avg', round(s.student_avg::numeric, 2),
            'class_avg', round(s.class_avg::numeric, 2),
            'class_min', round(s.class_min::numeric, 2),
            'class_max', round(s.class_max::numeric, 2),
            'ecart', round(s.ecart::numeric, 2),
            'rank', s.rank,
            'ranked_count', s.ranked_count
          )
          order by s.subject_name
        )
        from student_subjects s
      ),
      '[]'::jsonb
    ),
    'general', (
      select jsonb_build_object(
        'student_avg', round(gr.general_avg::numeric, 2),
        'class_avg', round(gs.class_avg::numeric, 2),
        'class_min', round(gs.class_min::numeric, 2),
        'class_max', round(gs.class_max::numeric, 2),
        'ecart', round((gr.general_avg - gs.class_avg)::numeric, 2),
        'rank', gr.rank,
        'ranked_count', gs.ranked_count
      )
      from general_ranks gr
      cross join general_stats gs
      where gr.student_id = p_student_id
    ),
    'attendance', (
      select jsonb_build_object(
        'absences', a.absences,
        'lates', a.lates
      )
      from attendance a
    )
  )
  into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.ef_bulletin_class_stats(uuid, uuid, text) from public;
grant execute on function public.ef_bulletin_class_stats(uuid, uuid, text) to authenticated;
