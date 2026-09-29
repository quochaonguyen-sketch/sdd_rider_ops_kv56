-- Pivot tồn pickup Assigned theo từng rider.
-- Nguồn: pickup_48h_realtime_riders (job pickup48h_no_api2) JOIN riders.cot
-- Mỗi rider 1 dòng, assigned tách 2 cột COT1 / COT2 theo COT của rider.

create table if not exists public.pickup_assigned_rider_pivot (
  driver_id text primary key,
  driver_name text not null default '',
  area text not null default '',
  rider_cot text not null default '',
  assigned_cot1 integer not null default 0,
  assigned_cot2 integer not null default 0,
  assigned_total integer not null default 0,
  onhold_orders integer not null default 0,
  zones text not null default '',
  snapshot_id text,
  snapshot_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pickup_assigned_rider_pivot_area_idx
  on public.pickup_assigned_rider_pivot (area, assigned_total desc);
create index if not exists pickup_assigned_rider_pivot_cot_idx
  on public.pickup_assigned_rider_pivot (rider_cot);

alter table public.pickup_assigned_rider_pivot enable row level security;

drop policy if exists authenticated_read_pickup_assigned_rider_pivot on public.pickup_assigned_rider_pivot;
create policy authenticated_read_pickup_assigned_rider_pivot
on public.pickup_assigned_rider_pivot for select to authenticated using (true);

grant select on table public.pickup_assigned_rider_pivot to authenticated;
grant all privileges on table public.pickup_assigned_rider_pivot to service_role;

create or replace function public.refresh_pickup_assigned_rider_pivot()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  delete from public.pickup_assigned_rider_pivot;
  insert into public.pickup_assigned_rider_pivot (
    driver_id, driver_name, area, rider_cot,
    assigned_cot1, assigned_cot2, assigned_total,
    onhold_orders, zones, snapshot_id, snapshot_at, updated_at
  )
  select
    r.driver_id,
    coalesce(nullif(btrim(r.driver_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(p.name), ''), r.driver_id),
    coalesce(nullif(btrim(r.area), ''), nullif(btrim(p.kv), ''), ''),
    case
      when upper(replace(coalesce(p.cot, ''), ' ', '')) like '%COT2%' then 'COT2'
      when upper(replace(coalesce(p.cot, ''), ' ', '')) like '%COT1%' then 'COT1'
      when coalesce(p.cot, '') ~* '(^|[^0-9])2([^0-9]|$)' then 'COT2'
      when coalesce(p.cot, '') ~* '(^|[^0-9])1([^0-9]|$)' then 'COT1'
      else upper(coalesce(p.cot, ''))
    end,
    case
      when upper(replace(coalesce(p.cot, ''), ' ', '')) like '%COT2%' then 0
      when upper(replace(coalesce(p.cot, ''), ' ', '')) like '%COT1%'
        or coalesce(p.cot, '') ~* '(^|[^0-9])1([^0-9]|$)' then coalesce(r.assigned_orders, 0)
      else 0
    end,
    case
      when upper(replace(coalesce(p.cot, ''), ' ', '')) like '%COT2%'
        or (coalesce(p.cot, '') ~* '(^|[^0-9])2([^0-9]|$)' and upper(replace(coalesce(p.cot, ''), ' ', '')) not like '%COT1%')
        then coalesce(r.assigned_orders, 0)
      else 0
    end,
    coalesce(r.assigned_orders, 0),
    coalesce(r.onhold_orders, 0),
    coalesce(r.zones, ''),
    r.snapshot_id,
    r.snapshot_at,
    now()
  from public.pickup_48h_realtime_riders r
  left join public.riders p on p.rider_code = r.driver_id
  where coalesce(r.assigned_orders, 0) > 0
    and coalesce(nullif(btrim(r.area), ''), p.kv, '') in ('KV5', 'KV6');
  get diagnostics n = row_count;
  return n;
end;
$function$;

grant execute on function public.refresh_pickup_assigned_rider_pivot() to authenticated;
grant execute on function public.refresh_pickup_assigned_rider_pivot() to service_role;

do $$
begin
  alter publication supabase_realtime add table public.pickup_assigned_rider_pivot;
exception when duplicate_object then null;
end;
$$;
