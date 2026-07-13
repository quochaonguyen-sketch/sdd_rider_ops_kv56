-- Apply once in Supabase SQL Editor for existing deployments.
-- Members must not be able to read or update Pickup Management tables directly.

alter table public.pickup_assignments enable row level security;

drop policy if exists "Authenticated users can read pickup assignments" on public.pickup_assignments;
drop policy if exists "Non-member users can read pickup assignments" on public.pickup_assignments;
create policy "Non-member users can read pickup assignments"
on public.pickup_assignments
for select
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);

drop policy if exists "Authenticated users can update pickup assignment routes" on public.pickup_assignments;
drop policy if exists "Non-member users can update pickup assignment routes" on public.pickup_assignments;
create policy "Non-member users can update pickup assignment routes"
on public.pickup_assignments
for update
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
)
with check (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);

alter table public.pickup_replacements enable row level security;

drop policy if exists "Authenticated users can read pickup replacements" on public.pickup_replacements;
drop policy if exists "Non-member users can read pickup replacements" on public.pickup_replacements;
create policy "Non-member users can read pickup replacements"
on public.pickup_replacements
for select
to authenticated
using (
  coalesce((select role from public.profiles where id = (select auth.uid())), 'viewer') <> 'member'
);
