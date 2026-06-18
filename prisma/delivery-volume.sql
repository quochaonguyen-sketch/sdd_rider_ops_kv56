-- Run once in Supabase SQL editor before importing delivery volume records.
create table if not exists public.delivery_volume (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  create_time timestamptz not null,
  received_time timestamptz not null,
  zone_id_raw text,
  zone_id_matched text,
  old_ward text,
  ward text,
  district text,
  area text,
  order_type text,
  cot_group text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_volume_shipment_id_key unique (shipment_id)
);

create index if not exists delivery_volume_create_time_idx on public.delivery_volume (create_time);
create index if not exists delivery_volume_received_time_idx on public.delivery_volume (received_time);
create index if not exists delivery_volume_zone_id_matched_idx on public.delivery_volume (zone_id_matched);
create index if not exists delivery_volume_district_ward_idx on public.delivery_volume (district, ward);
create index if not exists delivery_volume_area_idx on public.delivery_volume (area);
create index if not exists delivery_volume_cot_group_idx on public.delivery_volume (cot_group);

create or replace function public.set_delivery_volume_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_delivery_volume_updated_at on public.delivery_volume;
create trigger set_delivery_volume_updated_at
before update on public.delivery_volume
for each row
execute function public.set_delivery_volume_updated_at();

alter table public.delivery_volume enable row level security;

drop policy if exists "Authenticated users can read delivery volume" on public.delivery_volume;
create policy "Authenticated users can read delivery volume"
on public.delivery_volume
for select
to authenticated
using (true);

grant select on table public.delivery_volume to authenticated, service_role;
grant all privileges on table public.delivery_volume to service_role;
