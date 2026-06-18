-- Reset pickup_volume to the daily pickup summary shape produced by
-- C:\Code Python SDD\pickup_zone_daily_volume.py.
drop table if exists public.pickup_volume;

create table public.pickup_volume (
  id uuid primary key default gen_random_uuid(),
  summary_id text not null,
  report_date date not null,
  old_ward text,
  district text,
  area text,
  cot text,
  ma_tuyen text,
  total_orders integer not null default 0,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_volume_summary_id_key unique (summary_id)
);

create index pickup_volume_report_date_idx on public.pickup_volume (report_date);
create index pickup_volume_district_old_ward_idx on public.pickup_volume (district, old_ward);
create index pickup_volume_area_idx on public.pickup_volume (area);
create index pickup_volume_cot_idx on public.pickup_volume (cot);
create index pickup_volume_ma_tuyen_idx on public.pickup_volume (ma_tuyen);

create or replace function public.set_pickup_volume_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_pickup_volume_updated_at
before update on public.pickup_volume
for each row
execute function public.set_pickup_volume_updated_at();

alter table public.pickup_volume enable row level security;

create policy "Authenticated users can read pickup volume"
on public.pickup_volume
for select
to authenticated
using (true);

grant select on table public.pickup_volume to authenticated, service_role;
grant all privileges on table public.pickup_volume to service_role;
