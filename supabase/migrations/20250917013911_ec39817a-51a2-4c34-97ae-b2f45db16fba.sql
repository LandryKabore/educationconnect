-- Update Michael Omari's missing password and double-check all students without passwords
UPDATE student_temp_credentials SET temp_password_plain = '4826' WHERE username = 'omari.chika.michael' AND temp_password_plain IS NULL;

-- Let's also check all students that still don't have passwords
SELECT username, first_name, last_name, temp_password_plain IS NULL as missing_password
FROM student_temp_credentials 
WHERE temp_password_plain IS NULL
ORDER BY created_at;