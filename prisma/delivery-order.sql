-- Reset delivery_order to the daily delivery summary shape produced by
-- C:\Code Python SDD\order_volume.py.
drop table if exists public.delivery_order;

create table public.delivery_order (
  id uuid primary key default gen_random_uuid(),
  summary_id text not null,
  report_date date not null,
  old_ward text,
  district text,
  area text,
  cot text,
  total_orders integer not null default 0,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_order_summary_id_key unique (summary_id)
);

create index delivery_order_report_date_idx on public.delivery_order (report_date);
create index delivery_order_district_old_ward_idx on public.delivery_order (district, old_ward);
create index delivery_order_area_idx on public.delivery_order (area);
create index delivery_order_cot_idx on public.delivery_order (cot);

create or replace function public.set_delivery_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_delivery_order_updated_at
before update on public.delivery_order
for each row
execute function public.set_delivery_order_updated_at();

alter table public.delivery_order enable row level security;

create policy "Authenticated users can read delivery order"
on public.delivery_order
for select
to authenticated
using (true);

grant select on table public.delivery_order to authenticated, service_role;
grant all privileges on table public.delivery_order to service_role;
