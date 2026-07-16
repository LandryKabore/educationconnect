-- Extra school profile fields
alter table public.ecoles
  add column if not exists email text,
  add column if not exists region text,
  add column if not exists school_type text;

comment on column public.ecoles.school_type is 'primaire | secondaire | mixte | autre';
