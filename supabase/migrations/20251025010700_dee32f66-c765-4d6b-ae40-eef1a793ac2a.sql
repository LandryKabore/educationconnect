-- Fix Mohamed Ali's class_section_subjects
UPDATE class_section_subjects
SET teacher_user_id = '3101e1d8-02f3-4b50-a153-92e944b3ea4f'
WHERE teacher_user_id = '9697cbb1-9974-48af-9226-b5856d2e3837';

-- Fix Oshoala Inubu's class_section_subjects
UPDATE class_section_subjects
SET teacher_user_id = '758de477-cf3a-4b53-9577-b2e188477b68'
WHERE teacher_user_id = '61d52680-fb7a-42ce-ba19-9526022fa2f9';

-- Create teaching_assignments for Mohamed Ali
INSERT INTO teaching_assignments (teacher_user_id, class_section_id, subject_id, academic_year_id)
SELECT DISTINCT 
  '3101e1d8-02f3-4b50-a153-92e944b3ea4f'::uuid,
  css.class_section_id,
  css.subject_id,
  cs.academic_year_id
FROM class_section_subjects css
JOIN class_sections cs ON cs.id = css.class_section_id
WHERE css.teacher_user_id = '3101e1d8-02f3-4b50-a153-92e944b3ea4f'
  AND NOT EXISTS (
    SELECT 1 FROM teaching_assignments ta
    WHERE ta.teacher_user_id = '3101e1d8-02f3-4b50-a153-92e944b3ea4f'
      AND ta.class_section_id = css.class_section_id
      AND ta.subject_id = css.subject_id
  );

-- Create teaching_assignments for Oshoala Inubu
INSERT INTO teaching_assignments (teacher_user_id, class_section_id, subject_id, academic_year_id)
SELECT DISTINCT 
  '758de477-cf3a-4b53-9577-b2e188477b68'::uuid,
  css.class_section_id,
  css.subject_id,
  cs.academic_year_id
FROM class_section_subjects css
JOIN class_sections cs ON cs.id = css.class_section_id
WHERE css.teacher_user_id = '758de477-cf3a-4b53-9577-b2e188477b68'
  AND NOT EXISTS (
    SELECT 1 FROM teaching_assignments ta
    WHERE ta.teacher_user_id = '758de477-cf3a-4b53-9577-b2e188477b68'
      AND ta.class_section_id = css.class_section_id
      AND ta.subject_id = css.subject_id
  );