-- Migrate pickup_volume to the daily pickup summary shape without dropping data.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pickup_volume'
      and column_name = 'old_ward'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pickup_volume'
      and column_name = 'new_ward'
  ) then
    alter table public.pickup_volume rename column old_ward to new_ward;
  end if;
end $$;

alter table public.pickup_volume
  add column if not exists summary_id text,
  add column if not exists report_date date,
  add column if not exists new_ward text,
  add column if not exists district text,
  add column if not exists area text,
  add column if not exists cot text,
  add column if not exists ma_tuyen text,
  add column if not exists total_orders integer default 0;

create unique index if not exists pickup_volume_summary_id_key
on public.pickup_volume (summary_id);

create index if not exists pickup_volume_report_date_idx
on public.pickup_volume (report_date);

drop index if exists public.pickup_volume_district_old_ward_idx;

create index if not exists pickup_volume_district_new_ward_idx
on public.pickup_volume (district, new_ward);

create index if not exists pickup_volume_area_idx
on public.pickup_volume (area);

create index if not exists pickup_volume_cot_idx
on public.pickup_volume (cot);

create index if not exists pickup_volume_ma_tuyen_idx
on public.pickup_volume (ma_tuyen);
