-- LMHub Inventory (ton khu vuc KV5/KV6) · Supabase schema
-- Nguon: SPX_Launcher jobs/order_tracking_lmhub_received.py
--   build_output_legacy() tra ra 14 cot -> job upsert truc tiep vao bang nay (REPLACE = chi giu snapshot moi nhat).
--   Ton KV5/KV6 = filter area in ('KV5','KV6'). `area` lay tu Coverage SA theo zone_id (giong file).
-- Chay file nay trong Supabase SQL editor truoc khi bat job.

create table if not exists public.lmhub_inventory_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id text not null,
  snapshot_at timestamptz not null default now(),
  shipment_id text not null,
  create_time timestamptz,
  delivering_time timestamptz,
  received_time timestamptz,
  report_date date,
  ward text not null default '',
  district text not null default '',
  area text not null default '',
  zone_id text not null default '',
  status text not null default '',
  driver_id text not null default '',
  driver_name text not null default '',
  order_type text not null default '',
  cot_group text not null default '',
  created_at timestamptz not null default now(),
  constraint lmhub_inventory_rows_snapshot_shipment_key unique (snapshot_id, shipment_id)
);

create index if not exists lmhub_inventory_rows_snapshot_idx
  on public.lmhub_inventory_rows (snapshot_id, snapshot_at desc);
create index if not exists lmhub_inventory_rows_area_idx
  on public.lmhub_inventory_rows (snapshot_id, area);
create index if not exists lmhub_inventory_rows_ward_idx
  on public.lmhub_inventory_rows (snapshot_id, ward);
create index if not exists lmhub_inventory_rows_district_idx
  on public.lmhub_inventory_rows (snapshot_id, district);
create index if not exists lmhub_inventory_rows_status_idx
  on public.lmhub_inventory_rows (snapshot_id, status);
create index if not exists lmhub_inventory_rows_received_idx
  on public.lmhub_inventory_rows (snapshot_id, received_time desc);

alter table public.lmhub_inventory_rows enable row level security;

drop policy if exists "Authenticated users can read lmhub inventory" on public.lmhub_inventory_rows;
create policy "Authenticated users can read lmhub inventory"
on public.lmhub_inventory_rows for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on table public.lmhub_inventory_rows to authenticated;
grant all privileges on table public.lmhub_inventory_rows to service_role;

-- Realtime cho trang /lmhub-inventory (giong pickup_48h_*).
do $$
begin
  alter publication supabase_realtime add table public.lmhub_inventory_rows;
exception when duplicate_object then null;
end;
$$;
