-- Run in Supabase SQL editor before running pickup_route_pup_supabase.py.
-- The Python file upserts into public.pickup_assignments with on_conflict=assignment_key.
create table if not exists public.pickup_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_key text,
  assigned_at timestamptz,
  cot text,
  route_name text,
  mapped_pickup_point_group text,
  pickup_point_id text,
  pup_code text,
  shop_name text,
  shop_address text,
  ward text,
  district text,
  pickup_status integer,
  pickup_retry_assign_type integer default 0,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pickup_assignments add column if not exists assignment_key text;
alter table public.pickup_assignments add column if not exists assigned_at timestamptz;
alter table public.pickup_assignments add column if not exists cot text;
alter table public.pickup_assignments add column if not exists route_name text;
alter table public.pickup_assignments add column if not exists mapped_pickup_point_group text;
alter table public.pickup_assignments add column if not exists pickup_point_id text;
alter table public.pickup_assignments add column if not exists pup_code text;
alter table public.pickup_assignments add column if not exists shop_name text;
alter table public.pickup_assignments add column if not exists shop_address text;
alter table public.pickup_assignments add column if not exists ward text;
alter table public.pickup_assignments add column if not exists district text;
alter table public.pickup_assignments add column if not exists pickup_status integer;
alter table public.pickup_assignments add column if not exists pickup_retry_assign_type integer default 0;
alter table public.pickup_assignments add column if not exists raw_data jsonb;
alter table public.pickup_assignments add column if not exists created_at timestamptz not null default now();
alter table public.pickup_assignments add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pickup_assignments' and column_name = 'pup_id'
  ) then
    execute 'alter table public.pickup_assignments alter column pup_id drop not null';
    execute $sql$
      update public.pickup_assignments
      set
        pickup_point_id = coalesce(pickup_point_id, pup_id),
        pup_code = coalesce(pup_code, pup_id)
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pickup_assignments' and column_name = 'assigned_time'
  ) then
    execute $sql$
      update public.pickup_assignments
      set assigned_at = coalesce(assigned_at, nullif(assigned_time, '')::timestamptz)
      where assigned_time ~ '^\d{4}-\d{2}-\d{2}'
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pickup_assignments' and column_name = 'ma_tuyen'
  ) then
    execute $sql$
      update public.pickup_assignments
      set route_name = coalesce(route_name, ma_tuyen)
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pickup_assignments' and column_name = 'shop'
  ) then
    execute $sql$
      update public.pickup_assignments
      set shop_name = coalesce(shop_name, shop)
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pickup_assignments' and column_name = 'address'
  ) then
    execute $sql$
      update public.pickup_assignments
      set shop_address = coalesce(shop_address, address)
    $sql$;
  end if;
end $$;

alter table public.pickup_assignments
drop constraint if exists pickup_assignments_report_date_pup_id_key;

alter table public.pickup_assignments
drop constraint if exists pickup_assignments_assignment_key_key;

with ranked as (
  select
    id,
    row_number() over (
      partition by concat_ws('|', cot, route_name, pickup_point_id)
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_rank
  from public.pickup_assignments
)
delete from public.pickup_assignments target
using ranked
where target.id = ranked.id
  and ranked.row_rank > 1;

update public.pickup_assignments
set
  assignment_key = concat_ws('|', cot, route_name, pickup_point_id),
  pup_code = coalesce(pup_code, pickup_point_id),
  pickup_retry_assign_type = coalesce(pickup_retry_assign_type, 0);

alter table public.pickup_assignments alter column assignment_key set not null;

alter table public.pickup_assignments
add constraint pickup_assignments_assignment_key_key unique (assignment_key);

create index if not exists pickup_assignments_route_name_idx on public.pickup_assignments (route_name);
create index if not exists pickup_assignments_cot_idx on public.pickup_assignments (cot);
create index if not exists pickup_assignments_pickup_point_id_idx on public.pickup_assignments (pickup_point_id);
create index if not exists pickup_assignments_district_ward_idx on public.pickup_assignments (district, ward);

drop index if exists pickup_assignments_report_date_idx;
drop index if exists pickup_assignments_driver_id_idx;
alter table public.pickup_assignments drop column if exists report_date;
alter table public.pickup_assignments drop column if exists driver_name;
alter table public.pickup_assignments drop column if exists driver_id;

create or replace function public.set_pickup_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pickup_assignments_updated_at on public.pickup_assignments;
create trigger set_pickup_assignments_updated_at
before update on public.pickup_assignments
for each row
execute function public.set_pickup_assignments_updated_at();

alter table public.pickup_assignments enable row level security;

drop policy if exists "Authenticated users can read pickup assignments" on public.pickup_assignments;
drop policy if exists "Non-member users can read pickup assignments" on public.pickup_assignments;
create policy "Non-member users can read pickup assignments"
on public.pickup_assignments
for select
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);

drop policy if exists "Authenticated users can update pickup assignment routes" on public.pickup_assignments;
drop policy if exists "Non-member users can update pickup assignment routes" on public.pickup_assignments;
create policy "Non-member users can update pickup assignment routes"
on public.pickup_assignments
for update
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
)
with check (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);

grant select, update on table public.pickup_assignments to authenticated;
grant all privileges on table public.pickup_assignments to service_role;
