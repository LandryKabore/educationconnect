-- Update all remaining students with temporary passwords
UPDATE student_temp_credentials SET temp_password_plain = '1234' WHERE username = 'okafor.david' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '5678' WHERE username = 'nzinga.amara.daniel' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '9012' WHERE username = 'nkrumah.david' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '3456' WHERE username = 'lamine.kwame.fatou' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '7890' WHERE username = 'mbaye.mariam' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '2468' WHERE username = 'mensah.fatima.salif' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '1357' WHERE username = 'mensah.nathan.mariam' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '9753' WHERE username = 'konate.emmanuel' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '8642' WHERE username = 'okoro.grace' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '7531' WHERE username = 'nzinga.michael' AND temp_password_plain IS NULL;
UPDATE student_temp_credentials SET temp_password_plain = '4820' WHERE username = 'kamau.suleiman.samuel' AND temp_password_plain IS NULL;