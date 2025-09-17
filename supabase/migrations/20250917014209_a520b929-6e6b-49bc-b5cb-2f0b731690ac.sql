-- Check if there's a Grade 9A class section
SELECT id, name, grade_level, school_id, academic_year_id 
FROM class_sections 
WHERE grade_level ILIKE '%9A%' OR name ILIKE '%9A%'
ORDER BY created_at;