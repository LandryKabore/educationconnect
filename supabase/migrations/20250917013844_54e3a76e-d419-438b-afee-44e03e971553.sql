-- Check what usernames we have in the database and their temp_password_plain status
SELECT username, first_name, last_name, temp_password_plain, 
       CASE WHEN temp_password_plain IS NULL THEN 'Missing' ELSE 'Has Password' END as password_status
FROM student_temp_credentials 
WHERE first_name ILIKE '%yasmin%' OR last_name ILIKE '%omari%'
ORDER BY created_at;