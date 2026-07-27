create table if not exists public.return_order_snapshots (
  return_order_key text primary key,
  snapshot_id text not null,
  snapshot_at timestamptz not null,
  shipment_id text not null,
  sls_tracking_number text not null default '',
  shopee_order_sn text not null default '',
  order_status integer not null,
  status_label text not null default '',
  lowest_seller_address_id text not null default '',
  seller_district text not null default '',
  seller_ward text not null default '',
  seller_new_ward text not null default '',
  seller_area text not null default '',
  seller_zone_id text not null default '',
  order_zone_id text not null default '',
  current_station_id integer not null default 0,
  current_station_name text not null default '',
  pickup_station_id integer not null default 0,
  pickup_station_name text not null default '',
  pickup_point_id text not null default '',
  return_zone text not null default '',
  return_rider_codes text not null default '',
  return_rider_names text not null default '',
  return_riders_cot1 text not null default '',
  return_riders_cot2 text not null default '',
  return_driver_id text not null default '',
  return_driver_name text not null default '',
  create_time timestamptz,
  receive_time timestamptz,
  current_station_received_time timestamptz
);

alter table public.return_order_snapshots add column if not exists pickup_point_id text not null default '';
alter table public.return_order_snapshots add column if not exists return_zone text not null default '';
alter table public.return_order_snapshots add column if not exists return_rider_codes text not null default '';
alter table public.return_order_snapshots add column if not exists return_rider_names text not null default '';
alter table public.return_order_snapshots add column if not exists return_riders_cot1 text not null default '';
alter table public.return_order_snapshots add column if not exists return_riders_cot2 text not null default '';
alter table public.return_order_snapshots add column if not exists return_driver_id text not null default '';
alter table public.return_order_snapshots add column if not exists return_driver_name text not null default '';

create index if not exists return_order_snapshots_latest_idx
  on public.return_order_snapshots (snapshot_at desc);
create index if not exists return_order_snapshots_snapshot_idx
  on public.return_order_snapshots (snapshot_id, shipment_id);
create index if not exists return_order_snapshots_location_idx
  on public.return_order_snapshots (seller_area, seller_district, seller_ward);

alter table public.return_order_snapshots enable row level security;
grant select, insert, update, delete on table public.return_order_snapshots to service_role;
