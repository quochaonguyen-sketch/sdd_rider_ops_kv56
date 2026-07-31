create table if not exists public.return_order_handovers (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null unique,
  snapshot_id text not null,
  rider_code text not null,
  rider_name text not null default '',
  handed_over_at timestamptz not null default now(),
  scanned_by uuid not null references public.profiles(id) on delete restrict,
  source text not null default 'camera',
  created_at timestamptz not null default now()
);

create index if not exists return_order_handovers_rider_idx
  on public.return_order_handovers (rider_code, handed_over_at desc);

alter table public.return_order_handovers enable row level security;
grant select, insert on table public.return_order_handovers to service_role;
