-- Extra identity / contact fields for élèves and parents
alter table public.profils
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address text,
  add column if not exists matricule text;

comment on column public.profils.date_of_birth is 'Date de naissance';
comment on column public.profils.gender is 'M, F, or other';
comment on column public.profils.address is 'Adresse / quartier';
comment on column public.profils.matricule is 'Numéro matricule élève (optionnel)';
