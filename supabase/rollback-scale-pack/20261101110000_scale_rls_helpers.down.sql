-- Run only AFTER 20261101120000_scale_rls_policies.down.sql (policies must stop using these first).
drop function if exists public.ef_my_visible_profile_ids();
drop function if exists public.ef_my_taught_student_ids();
drop function if exists public.ef_my_admin_user_ids();
drop function if exists public.ef_my_child_ids();
drop function if exists public.ef_my_parent_class_ids();
drop function if exists public.ef_my_enrolled_class_ids();
drop function if exists public.ef_my_teaching_pairs();
drop function if exists public.ef_my_taught_class_ids();
drop function if exists public.ef_my_school_class_ids();
drop function if exists public.ef_my_admin_class_ids();
drop function if exists public.ef_my_admin_school_ids();
