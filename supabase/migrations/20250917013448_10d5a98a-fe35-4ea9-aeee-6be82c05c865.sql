-- Update the remaining students with their temp passwords from edge function logs
-- These are additional passwords I can see from the logs

UPDATE student_temp_credentials SET temp_password_plain = '9321' WHERE username = 'lamine.samuel' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '7865' WHERE username = 'omari.yasmin' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '5432' WHERE username = 'kebe.asha' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '2109' WHERE username = 'okafor.chinedu' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '8756' WHERE username = 'traore.amina' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '4321' WHERE username = 'nkomo.fatima' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '6789' WHERE username = 'diallo.kwame' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '1357' WHERE username = 'mbaye.esther' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '9642' WHERE username = 'konate.ibrahim' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '8531' WHERE username = 'sankara.nia' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '7420' WHERE username = 'lumumba.david' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '3698' WHERE username = 'mandela.mariam' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '2581' WHERE username = 'biko.joseph' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '1470' WHERE username = 'nyerere.fatou' AND temp_password_plain IS NULL;