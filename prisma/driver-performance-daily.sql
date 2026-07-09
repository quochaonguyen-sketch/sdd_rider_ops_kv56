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
