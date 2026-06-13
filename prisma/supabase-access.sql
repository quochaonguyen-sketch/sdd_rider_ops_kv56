-- Run after the Prisma tables have been created.
grant usage on schema public to authenticated, service_role;

grant select on table
  public.profiles,
  public.zones,
  public.riders,
  public.attendance_logs,
  public.activity_logs
to authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);
