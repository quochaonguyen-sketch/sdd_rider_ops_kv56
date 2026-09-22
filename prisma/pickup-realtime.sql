-- Pickup Realtime · Supabase schema
-- Run this file in the Supabase SQL editor before replacing the page mock data.
-- The importer should create one snapshot, then upsert its rider rows and 48h summary rows.

create table if not exists public.pickup_realtime_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  work_date date not null,
  snapshot_at timestamptz not null default now(),
  source_tab text not null default 'pickup_realtime',
  source_row_count integer not null default 0 check (source_row_count >= 0),
  assigned_orders integer not null default 0 check (assigned_orders >= 0),
  picked_orders integer not null default 0 check (picked_orders >= 0),
  onhold_orders integer not null default 0 check (onhold_orders >= 0),
  total_riders integer not null default 0 check (total_riders >= 0),
  raw_data jsonb,
  created_at timestamptz not null default now()
);

-- Compatibility fields for the current Google Sheet sync payload.
-- `create table if not exists` does not add columns to a table created earlier.
alter table public.pickup_realtime_snapshots
  add column if not exists assigned_orders integer not null default 0 check (assigned_orders >= 0),
  add column if not exists picked_orders integer not null default 0 check (picked_orders >= 0),
  add column if not exists onhold_orders integer not null default 0 check (onhold_orders >= 0),
  add column if not exists total_riders integer not null default 0 check (total_riders >= 0);

create index if not exists pickup_realtime_snapshots_work_date_snapshot_at_idx
  on public.pickup_realtime_snapshots (work_date, snapshot_at desc);

create table if not exists public.pickup_realtime_riders (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.pickup_realtime_snapshots(id) on delete cascade,
  rider_code text not null,
  rider_name text,
  area text not null check (area in ('KV5', 'KV6')),
  route_name text,
  cot text,
  pickup_district text,
  pickup_ward text,
  assigned_count integer not null default 0 check (assigned_count >= 0),
  picked_count integer not null default 0 check (picked_count >= 0 and picked_count <= assigned_count),
  pending_count integer generated always as (assigned_count - picked_count) stored,
  oldest_pending_at timestamptz,
  status text not null default 'on_track' check (status in ('on_track', 'watch', 'urgent')),
  source_row integer,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_realtime_riders_snapshot_rider_key unique (snapshot_id, rider_code)
);

create index if not exists pickup_realtime_riders_snapshot_area_idx
  on public.pickup_realtime_riders (snapshot_id, area, status);

create index if not exists pickup_realtime_riders_snapshot_pending_idx
  on public.pickup_realtime_riders (snapshot_id, pending_count desc);

create index if not exists pickup_realtime_riders_rider_code_idx
  on public.pickup_realtime_riders (rider_code);

-- One row per time bucket, area, and optional route in pickup_48h_summary.
-- Keep route_name/cot nullable for an area-level summary row.
create table if not exists public.pickup_48h_summary (
  id uuid primary key default gen_random_uuid(),
  summary_key text not null unique,
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  area text not null check (area in ('KV5', 'KV6')),
  route_name text,
  cot text,
  rider_count integer not null default 0 check (rider_count >= 0),
  assigned_count integer not null default 0 check (assigned_count >= 0),
  picked_count integer not null default 0 check (picked_count >= 0 and picked_count <= assigned_count),
  pending_count integer generated always as (assigned_count - picked_count) stored,
  source_row integer,
  raw_data jsonb,
  imported_at timestamptz not null default now(),
  constraint pickup_48h_summary_bucket_valid check (bucket_end > bucket_start)
);

create index if not exists pickup_48h_summary_area_bucket_idx
  on public.pickup_48h_summary (area, bucket_start desc);

create index if not exists pickup_48h_summary_bucket_idx
  on public.pickup_48h_summary (bucket_start desc);

create or replace function public.set_pickup_realtime_riders_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pickup_realtime_riders_updated_at on public.pickup_realtime_riders;
create trigger set_pickup_realtime_riders_updated_at
before update on public.pickup_realtime_riders
for each row
execute function public.set_pickup_realtime_riders_updated_at();

-- Convenience view for the Pickup Realtime screen: only the most recent snapshot.
-- Recreate it to keep its column order aligned after schema upgrades.
drop view if exists public.pickup_realtime_latest;
create view public.pickup_realtime_latest
with (security_invoker = true)
as
select
  rider.*,
  snapshot.snapshot_key,
  snapshot.work_date,
  snapshot.snapshot_at
from public.pickup_realtime_riders rider
join public.pickup_realtime_snapshots snapshot on snapshot.id = rider.snapshot_id
where snapshot.id = (
  select id
  from public.pickup_realtime_snapshots
  order by snapshot_at desc, created_at desc
  limit 1
);

alter table public.pickup_realtime_snapshots enable row level security;
alter table public.pickup_realtime_riders enable row level security;
alter table public.pickup_48h_summary enable row level security;

drop policy if exists "Authenticated users can read pickup realtime snapshots" on public.pickup_realtime_snapshots;
create policy "Authenticated users can read pickup realtime snapshots"
on public.pickup_realtime_snapshots for select to authenticated using (true);

drop policy if exists "Authenticated users can read pickup realtime riders" on public.pickup_realtime_riders;
create policy "Authenticated users can read pickup realtime riders"
on public.pickup_realtime_riders for select to authenticated using (true);

drop policy if exists "Authenticated users can read pickup 48h summary" on public.pickup_48h_summary;
create policy "Authenticated users can read pickup 48h summary"
on public.pickup_48h_summary for select to authenticated using (true);

grant select on public.pickup_realtime_snapshots, public.pickup_realtime_riders, public.pickup_48h_summary to authenticated;
grant select on public.pickup_realtime_latest to authenticated;
grant all privileges on public.pickup_realtime_snapshots, public.pickup_realtime_riders, public.pickup_48h_summary to service_role;

-- Enables browser subscriptions used by the existing Supabase realtime hook.
do $$
begin
  alter publication supabase_realtime add table public.pickup_realtime_snapshots;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.pickup_realtime_riders;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.pickup_48h_summary;
exception when duplicate_object then null;
end;
$$;
