create table if not exists public.driver_performance_daily (
  performance_id text primary key,
  report_date date not null,
  driver_id text not null,
  driver_name text,
  contract_type_name text,
  delivery_assigned integer default 0,
  delivery_delivered integer default 0,
  pickup_assigned integer default 0,
  pickup_picked integer default 0,
  delivery_success_rate numeric,
  pickup_success_rate numeric,
  fetched_at timestamp without time zone not null default now()
);

create index if not exists driver_performance_daily_report_date_idx
  on public.driver_performance_daily (report_date);

create index if not exists driver_performance_daily_driver_id_idx
  on public.driver_performance_daily (driver_id);

create index if not exists driver_performance_daily_report_date_driver_id_idx
  on public.driver_performance_daily (report_date, driver_id);

create index if not exists driver_performance_daily_driver_id_report_date_idx
  on public.driver_performance_daily (driver_id, report_date);

create extension if not exists pg_trgm;

create index if not exists driver_performance_daily_driver_id_trgm_idx
  on public.driver_performance_daily using gin (driver_id gin_trgm_ops);

create index if not exists driver_performance_daily_driver_name_trgm_idx
  on public.driver_performance_daily using gin (driver_name gin_trgm_ops);

create index if not exists driver_performance_daily_contract_type_trgm_idx
  on public.driver_performance_daily using gin (contract_type_name gin_trgm_ops);

create index if not exists riders_full_name_trgm_idx
  on public.riders using gin (full_name gin_trgm_ops);

create index if not exists riders_kv_rider_code_idx
  on public.riders (kv, rider_code);

create index if not exists riders_cot_trgm_idx
  on public.riders using gin (cot gin_trgm_ops);

create index if not exists riders_pickup_district_trgm_idx
  on public.riders using gin (pickup_district gin_trgm_ops);

create index if not exists riders_delivery_district_trgm_idx
  on public.riders using gin (delivery_district gin_trgm_ops);

-- Optional cache if the raw event source grows beyond daily-driver rows.
-- Refresh after each import job:
-- refresh materialized view concurrently public.driver_performance_daily_rollup;
create materialized view if not exists public.driver_performance_daily_rollup as
select
  report_date,
  driver_id,
  max(driver_name) as driver_name,
  max(contract_type_name) as contract_type_name,
  sum(coalesce(delivery_assigned, 0))::integer as delivery_assigned,
  sum(coalesce(delivery_delivered, 0))::integer as delivery_delivered,
  sum(coalesce(pickup_assigned, 0))::integer as pickup_assigned,
  sum(coalesce(pickup_picked, 0))::integer as pickup_picked,
  case
    when sum(coalesce(delivery_assigned, 0)) > 0
      then sum(coalesce(delivery_delivered, 0))::numeric / sum(coalesce(delivery_assigned, 0)) * 100
  end as delivery_success_rate,
  case
    when sum(coalesce(pickup_assigned, 0)) > 0
      then sum(coalesce(pickup_picked, 0))::numeric / sum(coalesce(pickup_assigned, 0)) * 100
  end as pickup_success_rate
from public.driver_performance_daily
group by report_date, driver_id
with no data;

create unique index if not exists driver_performance_daily_rollup_pk
  on public.driver_performance_daily_rollup (report_date, driver_id);
