-- Delete the emile.kabore2 temporary credentials so a fresh emile.kabore can be created
DELETE FROM teacher_temp_credentials 
WHERE username = 'emile.kabore2' 
AND is_used = false;