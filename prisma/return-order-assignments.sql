create table if not exists public.return_order_assignments (
  shipment_id text primary key,
  rider_id uuid not null references public.riders(id) on delete restrict,
  rider_code text not null,
  rider_name text not null default '',
  cot text not null default '',
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists return_order_assignments_rider_idx
  on public.return_order_assignments (rider_code);

alter table public.return_order_assignments enable row level security;
grant select, insert, update, delete on table public.return_order_assignments to service_role;
