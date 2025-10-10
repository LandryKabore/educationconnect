-- Manually enroll Amadou in his assigned class
INSERT INTO enrollments (student_user_id, class_section_id, academic_year_id, status)
VALUES ('2e400173-38d4-4ee2-9960-fb41186d8ee9', 'd5cc0a91-d3cb-4b9e-9ebb-4dd1bf911333', '57a35d63-317c-42ba-bba5-a97aa3328dbf', 'active')
ON CONFLICT DO NOTHING;