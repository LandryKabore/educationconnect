-- Delete members from Math Warriors groups
DELETE FROM study_group_members 
WHERE study_group_id IN (
  SELECT id FROM study_groups WHERE name ILIKE '%math%warrior%'
);

-- Delete the Math Warriors groups
DELETE FROM study_groups 
WHERE name ILIKE '%math%warrior%';