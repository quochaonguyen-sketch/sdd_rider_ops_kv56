update public.riders
set status = case
  when lower(coalesce(status, '')) = 'inactive' then 'inactive'
  else 'active'
end;

alter table public.riders
  alter column status set default 'active',
  alter column status set not null;

alter table public.riders
  drop constraint if exists riders_status_check;

alter table public.riders
  add constraint riders_status_check
  check (status in ('active', 'inactive'));
