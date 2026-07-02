create table if not exists public.rider_violations (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.riders(id) on delete set null,
  rider_code text not null,
  rider_name text,
  work_date date not null,
  violation_type text not null check (violation_type in ('LATE_CHECKIN','NO_SHOW','SLA_BREACH','SAFETY','POLICY','OFF_UNEXPECTED','WORKING_REST_DAY')),
  severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH')),
  zone text,
  note text,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  source text not null default 'manual',
  dedupe_key text unique,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rider_violations_work_date_idx on public.rider_violations (work_date desc);
create index if not exists rider_violations_status_idx on public.rider_violations (status);
create index if not exists rider_violations_rider_idx on public.rider_violations (rider_code);

alter table public.rider_violations enable row level security;
drop policy if exists "Authenticated users can read rider violations" on public.rider_violations;
create policy "Authenticated users can read rider violations" on public.rider_violations for select to authenticated using (true);
grant select on table public.rider_violations to authenticated;
grant all privileges on table public.rider_violations to service_role;

create or replace function public.set_rider_violations_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_rider_violations_updated_at on public.rider_violations;
create trigger set_rider_violations_updated_at before update on public.rider_violations
for each row execute function public.set_rider_violations_updated_at();
