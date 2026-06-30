-- Run once in Supabase SQL editor before enabling the Python realtime import.
create table if not exists public.realtime_delivery_riders (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  driver_id text not null,
  driver_name text,
  total_assigned integer not null default 0,
  delivered integer not null default 0,
  delivering integer not null default 0,
  failed integer not null default 0,
  zone_id text,
  first_delivery_at time,
  idle_delivery_seconds integer not null default 0,
  snapshot_id uuid not null,
  snapshot_at timestamptz not null,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint realtime_delivery_riders_work_date_driver_key unique (work_date, driver_id)
);

create index if not exists realtime_delivery_riders_snapshot_idx
on public.realtime_delivery_riders (work_date, snapshot_at desc);

create or replace function public.set_realtime_delivery_riders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_realtime_delivery_riders_updated_at on public.realtime_delivery_riders;
create trigger set_realtime_delivery_riders_updated_at
before update on public.realtime_delivery_riders
for each row
execute function public.set_realtime_delivery_riders_updated_at();

alter table public.realtime_delivery_riders enable row level security;

drop policy if exists "Authenticated users can read realtime delivery riders" on public.realtime_delivery_riders;
create policy "Authenticated users can read realtime delivery riders"
on public.realtime_delivery_riders
for select
to authenticated
using (true);

grant select on table public.realtime_delivery_riders to authenticated, service_role;
grant all privileges on table public.realtime_delivery_riders to service_role;
