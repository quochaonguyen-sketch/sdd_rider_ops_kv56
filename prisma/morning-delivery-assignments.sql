create table if not exists public.morning_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_code text not null,
  district text not null,
  ward text not null,
  assigned_at timestamptz not null default now(),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  constraint morning_delivery_assignments_rider_area_key unique (work_date, rider_id, district, ward)
);

-- Một phường có thể có nhiều rider (ví dụ rider thay thế khi rider cố định OFF).
-- Chỉ chặn việc ghi trùng đúng rider vào đúng phường trong cùng ngày.
alter table public.morning_delivery_assignments
  drop constraint if exists morning_delivery_assignments_area_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'morning_delivery_assignments_rider_area_key'
      and conrelid = 'public.morning_delivery_assignments'::regclass
  ) then
    alter table public.morning_delivery_assignments
      add constraint morning_delivery_assignments_rider_area_key
      unique (work_date, rider_id, district, ward);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'morning_delivery_assignments'
      and column_name = 'checked_in_at'
  ) then
    alter table public.morning_delivery_assignments add column checked_in_at timestamptz;
    -- Rows made by the old flow were assigned only after the rider scanned.
    update public.morning_delivery_assignments set checked_in_at = assigned_at;
  end if;
end $$;

create index if not exists morning_delivery_assignments_date_idx
on public.morning_delivery_assignments (work_date);

create index if not exists morning_delivery_assignments_rider_idx
on public.morning_delivery_assignments (work_date, rider_id);

create table if not exists public.morning_delivery_absence_notes (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_code text not null,
  reason text not null default '',
  is_excused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint morning_delivery_absence_notes_rider_key unique (work_date, rider_id)
);

create index if not exists morning_delivery_absence_notes_date_idx
on public.morning_delivery_absence_notes (work_date);

alter table public.morning_delivery_assignments enable row level security;
alter table public.morning_delivery_absence_notes enable row level security;

drop policy if exists "Authenticated users can read morning assignments"
on public.morning_delivery_assignments;

create policy "Authenticated users can read morning assignments"
on public.morning_delivery_assignments
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read morning absence notes"
on public.morning_delivery_absence_notes;

create policy "Authenticated users can read morning absence notes"
on public.morning_delivery_absence_notes
for select
to authenticated
using (true);

grant select on table public.morning_delivery_assignments to authenticated, service_role;
grant all privileges on table public.morning_delivery_assignments to service_role;
grant select on table public.morning_delivery_absence_notes to authenticated, service_role;
grant all privileges on table public.morning_delivery_absence_notes to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'morning_delivery_assignments'
    ) then
    alter publication supabase_realtime add table public.morning_delivery_assignments;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'morning_delivery_absence_notes'
    ) then
    alter publication supabase_realtime add table public.morning_delivery_absence_notes;
  end if;
end $$;
