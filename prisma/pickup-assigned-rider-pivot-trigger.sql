-- Tu rebuild pickup_assigned_rider_pivot khi job pickup48h_no_api2 ghi riders.
create or replace function public.trg_refresh_pickup_assigned_rider_pivot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.refresh_pickup_assigned_rider_pivot();
  return null;
exception when others then
  raise warning 'refresh_pickup_assigned_rider_pivot trigger: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists pickup_48h_riders_refresh_pivot on public.pickup_48h_realtime_riders;
create trigger pickup_48h_riders_refresh_pivot
after insert or update or delete on public.pickup_48h_realtime_riders
for each statement
execute function public.trg_refresh_pickup_assigned_rider_pivot();
