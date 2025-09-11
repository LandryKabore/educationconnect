-- Create a student profile for the existing student linked to friendship school
INSERT INTO student_profiles (user_id, school_id, student_no, dob, gender)
VALUES (
  '43bb7914-f0fb-4ba6-a77c-14855ac9cf9f',  -- existing student user_id
  'e6d72216-fe2a-4d4a-9fc9-14da08d4d655',  -- friendship school id
  'STU001',
  '2010-01-01',
  'male'
);