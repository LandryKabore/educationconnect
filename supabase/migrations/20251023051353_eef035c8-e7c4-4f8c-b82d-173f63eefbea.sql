-- Link existing students in student_temp_credentials to their class sections based on grade_level
DO $$
DECLARE
  student_record RECORD;
  matched_section_id UUID;
BEGIN
  -- Loop through all unverified students that have a grade_level but no class_section_id
  FOR student_record IN 
    SELECT id, student_user_id, grade_level, school_id
    FROM student_temp_credentials
    WHERE is_used = false 
    AND grade_level IS NOT NULL 
    AND class_section_id IS NULL
  LOOP
    -- Find matching class section by name or grade_level
    SELECT cs.id INTO matched_section_id
    FROM class_sections cs
    WHERE cs.school_id = student_record.school_id
    AND (
      cs.name ILIKE student_record.grade_level
      OR CONCAT(cs.grade_level, ' ', cs.name) ILIKE student_record.grade_level
      OR cs.name ILIKE '%' || SUBSTRING(student_record.grade_level FROM '[0-9]+[A-Z]') || '%'
    )
    LIMIT 1;
    
    -- If we found a matching class section, update the student_temp_credentials
    IF matched_section_id IS NOT NULL THEN
      UPDATE student_temp_credentials
      SET class_section_id = matched_section_id
      WHERE id = student_record.id;
      
      RAISE NOTICE 'Linked student % to class section %', student_record.student_user_id, matched_section_id;
    END IF;
  END LOOP;
END $$;