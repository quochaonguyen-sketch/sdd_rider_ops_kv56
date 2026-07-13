create table if not exists public.pickup_replacements (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.riders(id) on delete cascade,
  rider_code text not null,
  work_date date not null,
  replacement_rider_id uuid references public.riders(id) on delete set null,
  replacement_rider_code text,
  status text not null default 'MISSING' check (status in ('ASSIGNED','MISSING')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_replacements_rider_date_key unique (rider_code, work_date)
);
create index if not exists pickup_replacements_date_idx on public.pickup_replacements(work_date);
alter table public.pickup_replacements enable row level security;
drop policy if exists "Authenticated users can read pickup replacements" on public.pickup_replacements;
drop policy if exists "Non-member users can read pickup replacements" on public.pickup_replacements;
create policy "Non-member users can read pickup replacements"
on public.pickup_replacements
for select
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);
grant select on public.pickup_replacements to authenticated;
grant all privileges on public.pickup_replacements to service_role;
create or replace function public.set_pickup_replacements_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists set_pickup_replacements_updated_at on public.pickup_replacements;
create trigger set_pickup_replacements_updated_at before update on public.pickup_replacements for each row execute function public.set_pickup_replacements_updated_at();
