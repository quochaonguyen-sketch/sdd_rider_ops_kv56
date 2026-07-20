create table if not exists public.rider_off_requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_code text not null,
  off_date date not null,
  request_type text not null check (request_type in ('WEEKLY', 'PLANNED', 'EMERGENCY')),
  shift text not null default 'FULL_DAY' check (shift in ('FULL_DAY', 'MORNING', 'AFTERNOON')),
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_off_requests_rider_date_key unique (rider_id, off_date)
);

alter table public.rider_off_requests
  add column if not exists batch_id uuid,
  add column if not exists evidence_path text,
  add column if not exists evidence_name text,
  add column if not exists evidence_type text,
  add column if not exists requester_email text,
  add column if not exists email_notification_status text not null default 'PENDING',
  add column if not exists email_notification_error text,
  add column if not exists email_notified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rider_off_requests_email_notification_status_check'
  ) then
    alter table public.rider_off_requests
      add constraint rider_off_requests_email_notification_status_check
      check (email_notification_status in ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED'));
  end if;
end;
$$;

update public.rider_off_requests
set batch_id = id
where batch_id is null;

alter table public.rider_off_requests
  alter column batch_id set default gen_random_uuid(),
  alter column batch_id set not null;

create index if not exists rider_off_requests_off_date_idx
  on public.rider_off_requests (off_date);

create index if not exists rider_off_requests_status_idx
  on public.rider_off_requests (status);

create index if not exists rider_off_requests_batch_id_idx
  on public.rider_off_requests (batch_id);

alter table public.rider_off_requests enable row level security;
revoke all on table public.rider_off_requests from anon, authenticated;
grant select, insert, update, delete on table public.rider_off_requests to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'off-request-evidence',
  'off-request-evidence',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.touch_rider_off_request_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rider_off_requests_touch_updated_at on public.rider_off_requests;
create trigger rider_off_requests_touch_updated_at
before update on public.rider_off_requests
for each row execute function public.touch_rider_off_request_updated_at();
