-- LMHub fetch queue on Supabase (thay tab Google Sheet LMHUB_Queue)
-- Web /lmhub-inventory bam Fetch -> insert PENDING vao bang nay.
-- Worker may noi bo goi claim_lmhub_fetch_job() roi keo LMHub va upsert lmhub_inventory_rows.

create table if not exists public.lmhub_fetch_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'PENDING',
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  message text not null default '',
  error_message text,
  worker_id text,
  snapshot_id text,
  row_count integer,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lmhub_fetch_jobs_status_check
    check (status = any (array['PENDING'::text, 'RUNNING'::text, 'DONE'::text, 'ERROR'::text, 'CANCELLED'::text]))
);

create index if not exists lmhub_fetch_jobs_status_requested_idx
  on public.lmhub_fetch_jobs (status, requested_at desc);
create index if not exists lmhub_fetch_jobs_requested_at_idx
  on public.lmhub_fetch_jobs (requested_at desc);

alter table public.lmhub_fetch_jobs enable row level security;

drop policy if exists "Authenticated users can read lmhub fetch jobs" on public.lmhub_fetch_jobs;
create policy "Authenticated users can read lmhub fetch jobs"
on public.lmhub_fetch_jobs for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on table public.lmhub_fetch_jobs to authenticated;
grant all privileges on table public.lmhub_fetch_jobs to service_role;

do $$
begin
  alter publication supabase_realtime add table public.lmhub_fetch_jobs;
exception when duplicate_object then null;
end;
$$;

create or replace function public.claim_lmhub_fetch_job(p_worker_id text default 'lmhub-worker')
returns public.lmhub_fetch_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.lmhub_fetch_jobs;
begin
  update public.lmhub_fetch_jobs
  set status = 'ERROR',
      error_message = 'Timeout: job RUNNING qua 15 phut, tra lai hang doi',
      finished_at = now(),
      updated_at = now()
  where status = 'RUNNING'
    and coalesce(started_at, requested_at) < now() - interval '15 minutes';

  select * into job
  from public.lmhub_fetch_jobs
  where status = 'PENDING'
  order by requested_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.lmhub_fetch_jobs
  set status = 'RUNNING',
      worker_id = nullif(trim(p_worker_id), ''),
      started_at = now(),
      updated_at = now()
  where id = job.id
  returning * into job;

  return job;
end;
$$;

revoke all on function public.claim_lmhub_fetch_job(text) from public;
grant execute on function public.claim_lmhub_fetch_job(text) to service_role;
