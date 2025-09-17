-- Check if the imported students are enrolled in the Grade 9A class
-- First, check current enrollments for Grade 9A class
SELECT e.*, p.first_name, p.last_name, p.email
FROM enrollments e
JOIN profiles p ON p.user_id = e.student_user_id
WHERE e.class_section_id = 'd5cc0a91-d3cb-4b9e-9ebb-4dd1bf911333'
ORDER BY p.last_name, p.first_name;

-- Also check how many temp credential students we have for Grade 9A
SELECT COUNT(*) as temp_students_count
FROM student_temp_credentials 
WHERE grade_level = 'Grade 9A' AND school_id = 'e6d72216-fe2a-4d4a-9fc9-14da08d4d655';