-- Operational data retention.
-- Keep only the last p_retention_interval (default 1 month) of high-volume
-- operational tables; everything older is deleted in a single set-based pass.
-- Date columns:
--   rider_violations.work_date, realtime_delivery_riders_10am.work_date,
--   morning_delivery_assignments.work_date, driver_performance_daily.report_date,
--   attendance_sheet_sync_outbox.created_at, attendance_logs.work_date,
--   activity_logs.created_at
-- The attendance_logs -> attendance_sheet_sync_outbox trigger is disabled for
-- the duration of the run so that removing old OFF days does not enqueue a
-- flood of CLEAR events destined for Google Sheets.

create or replace function public.purge_operational_data(
  p_retention_interval interval default '1 month'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - coalesce(p_retention_interval, interval '1 month');
  cutoff_date date := (now() - coalesce(p_retention_interval, interval '1 month'))::date;
  result jsonb := '{}'::jsonb;
begin
  -- Outbox rows are a queue keyed by created_at; drop the delivered/aged ones.
  delete from public.attendance_sheet_sync_outbox
  where created_at < cutoff;
  get diagnostics result = result || jsonb_build_object('attendance_sheet_sync_outbox', item_count);

  -- Prevent the outbox trigger from firing while historical attendance rows go.
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.attendance_logs'::regclass
      and tgname = 'attendance_sheet_sync_outbox_trigger'
      and not tgisinternal
  ) then
    execute 'alter table public.attendance_logs disable trigger attendance_sheet_sync_outbox_trigger';
  end if;

  delete from public.attendance_logs
  where work_date < cutoff_date;
  get diagnostics result = result || jsonb_build_object('attendance_logs', item_count);

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.attendance_logs'::regclass
      and tgname = 'attendance_sheet_sync_outbox_trigger'
      and not tgisinternal
  ) then
    execute 'alter table public.attendance_logs enable trigger attendance_sheet_sync_outbox_trigger';
  end if;

  delete from public.rider_violations
  where work_date < cutoff_date;
  get diagnostics result = result || jsonb_build_object('rider_violations', item_count);

  delete from public.realtime_delivery_riders_10am
  where work_date < cutoff_date;
  get diagnostics result = result || jsonb_build_object('realtime_delivery_riders_10am', item_count);

  delete from public.morning_delivery_assignments
  where work_date < cutoff_date;
  get diagnostics result = result || jsonb_build_object('morning_delivery_assignments', item_count);

  delete from public.driver_performance_daily
  where report_date < cutoff_date;
  get diagnostics result = result || jsonb_build_object('driver_performance_daily', item_count);

  delete from public.activity_logs
  where created_at < cutoff;
  get diagnostics result = result || jsonb_build_object('activity_logs', item_count);

  return result || jsonb_build_object(
    'cutoff', cutoff,
    'cutoff_date', cutoff_date,
    'retention_interval', coalesce(p_retention_interval, interval '1 month')
  );
end;
$$;

comment on function public.purge_operational_data(interval) is
  'Deletes operational rows older than p_retention_interval from retention-managed tables. Returns per-table delete counts.';

revoke all on function public.purge_operational_data(interval) from public;
grant execute on function public.purge_operational_data(interval) to service_role;