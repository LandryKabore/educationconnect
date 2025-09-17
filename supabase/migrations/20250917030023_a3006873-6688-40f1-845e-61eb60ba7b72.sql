-- Clean up old unused teacher temporary credentials for emile.kabore
DELETE FROM teacher_temp_credentials 
WHERE username IN ('emile.kabore1') 
AND is_used = false;