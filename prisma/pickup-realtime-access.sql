-- Pickup Realtime: allow signed-in application users to read the synced data.
-- Keep anonymous users out; Google/domain authorization is enforced by the app.

grant usage on schema public to authenticated;

grant select on table public.pickup_48h_realtime_riders to authenticated;
grant select on table public.pickup_48h_summary_groups to authenticated;
grant select on table public.riders to authenticated;

alter table public.pickup_48h_realtime_riders enable row level security;
alter table public.pickup_48h_summary_groups enable row level security;
alter table public.riders enable row level security;

drop policy if exists "authenticated_read_pickup_48h_realtime_riders" on public.pickup_48h_realtime_riders;
create policy "authenticated_read_pickup_48h_realtime_riders"
  on public.pickup_48h_realtime_riders
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_pickup_48h_summary_groups" on public.pickup_48h_summary_groups;
create policy "authenticated_read_pickup_48h_summary_groups"
  on public.pickup_48h_summary_groups
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_riders" on public.riders;
create policy "authenticated_read_riders"
  on public.riders
  for select
  to authenticated
  using (true);
