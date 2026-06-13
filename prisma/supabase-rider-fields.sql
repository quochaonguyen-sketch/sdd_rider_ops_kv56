-- Run once to align public.riders with the spreadsheet rider fields.
alter table public.riders
  add column if not exists kv text,
  add column if not exists home_district text,
  add column if not exists cot text,
  add column if not exists full_name text,
  add column if not exists pickup_district text,
  add column if not exists pickup_ward text,
  add column if not exists point_name text,
  add column if not exists delivery_district text,
  add column if not exists delivery_ward text;

update public.riders
set full_name = coalesce(full_name, name)
where full_name is null
  and name is not null;
