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

create index if not exists rider_off_requests_off_date_idx
  on public.rider_off_requests (off_date);

create index if not exists rider_off_requests_status_idx
  on public.rider_off_requests (status);

alter table public.rider_off_requests enable row level security;
revoke all on table public.rider_off_requests from anon, authenticated;
grant select, insert, update, delete on table public.rider_off_requests to service_role;

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
