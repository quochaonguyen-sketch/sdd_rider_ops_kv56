create table if not exists public.realtime_delivery_riders_10am (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  driver_id text not null,
  driver_name text,
  total_assigned integer not null default 0,
  delivered integer not null default 0,
  delivering integer not null default 0,
  failed integer not null default 0,
  snapshot_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint realtime_delivery_riders_10am_date_driver_key unique (work_date, driver_id)
);

create index if not exists realtime_delivery_riders_10am_date_idx
on public.realtime_delivery_riders_10am (work_date);

alter table public.realtime_delivery_riders_10am enable row level security;

drop policy if exists "Authenticated users can read realtime delivery cutoff" on public.realtime_delivery_riders_10am;
create policy "Authenticated users can read realtime delivery cutoff"
on public.realtime_delivery_riders_10am for select to authenticated using (true);

grant select on table public.realtime_delivery_riders_10am to authenticated, service_role;
grant all privileges on table public.realtime_delivery_riders_10am to service_role;

-- Best-effort backfill when the current retained snapshot itself is not later
-- than 10:00 Vietnam time. Later snapshots cannot reconstruct the 10:00 state.
insert into public.realtime_delivery_riders_10am (
  work_date, driver_id, driver_name, total_assigned, delivered,
  delivering, failed, snapshot_at, updated_at
)
select
  work_date, driver_id, driver_name, total_assigned, delivered,
  delivering, failed, snapshot_at, snapshot_at
from public.realtime_delivery_riders
where snapshot_at <= ((work_date::timestamp + interval '10 hours') at time zone 'Asia/Ho_Chi_Minh')
on conflict (work_date, driver_id) do update set
  driver_name = excluded.driver_name,
  total_assigned = excluded.total_assigned,
  delivered = excluded.delivered,
  delivering = excluded.delivering,
  failed = excluded.failed,
  snapshot_at = excluded.snapshot_at,
  updated_at = excluded.updated_at;
