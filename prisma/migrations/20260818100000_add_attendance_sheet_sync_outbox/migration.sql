-- Durable Google Sheets delivery queue for attendance changes.
-- The trigger runs in the same database transaction as attendance_logs, so a
-- successful web write can always be retried until Google Sheets is updated.
create table if not exists public.attendance_sheet_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  rider_code text not null,
  work_date date not null,
  attendance_status text not null,
  operation text not null check (operation in ('UPSERT', 'CLEAR')),
  state text not null default 'PENDING' check (state in ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  synced_at timestamptz,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_sheet_sync_outbox_pending_idx
  on public.attendance_sheet_sync_outbox (next_attempt_at, created_at)
  where state in ('PENDING', 'FAILED');

create index if not exists attendance_sheet_sync_outbox_schedule_idx
  on public.attendance_sheet_sync_outbox (rider_code, work_date, created_at desc);

alter table public.attendance_sheet_sync_outbox enable row level security;

create or replace function public.queue_attendance_sheet_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_source text;
  target_rider_code text;
  target_work_date date;
  target_status text;
  target_operation text;
  target_updated_at timestamptz;
begin
  -- Rows imported from Google must not be sent straight back to Google.
  row_source := coalesce(
    case when tg_op = 'DELETE' then old.raw_data ->> 'source' else new.raw_data ->> 'source' end,
    ''
  );
  if row_source in ('google_sheet_off', 'google_sheet_webhook') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('OFF_WEEKLY', 'OFF_APPROVED', 'OFF_UNEXPECTED', 'WORKING_REST_DAY', 'NO_PICKUP', 'NO_DELIVERY') then
      return old;
    end if;
    target_rider_code := old.rider_code;
    target_work_date := old.work_date;
    target_status := 'ON';
    target_operation := 'CLEAR';
    target_updated_at := coalesce(old.updated_at, now());
  else
    if new.status not in ('OFF_WEEKLY', 'OFF_APPROVED', 'OFF_UNEXPECTED', 'WORKING_REST_DAY', 'NO_PICKUP', 'NO_DELIVERY') then
      return new;
    end if;
    target_rider_code := new.rider_code;
    target_work_date := new.work_date;
    target_status := new.status;
    target_operation := 'UPSERT';
    target_updated_at := coalesce(new.updated_at, now());
  end if;

  insert into public.attendance_sheet_sync_outbox (
    rider_code, work_date, attendance_status, operation, source_updated_at
  ) values (
    target_rider_code, target_work_date, target_status, target_operation, target_updated_at
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists attendance_sheet_sync_outbox_trigger on public.attendance_logs;
create trigger attendance_sheet_sync_outbox_trigger
after insert or update or delete on public.attendance_logs
for each row execute function public.queue_attendance_sheet_sync();

create or replace function public.set_attendance_sheet_sync_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_sheet_sync_outbox_updated_at on public.attendance_sheet_sync_outbox;
create trigger attendance_sheet_sync_outbox_updated_at
before update on public.attendance_sheet_sync_outbox
for each row execute function public.set_attendance_sheet_sync_outbox_updated_at();
