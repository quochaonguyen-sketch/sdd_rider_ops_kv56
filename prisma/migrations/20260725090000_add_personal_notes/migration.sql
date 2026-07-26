create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null default '' check (char_length(content) <= 10000),
  is_pinned boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_notes_user_updated_idx on public.personal_notes (user_id, is_pinned desc, updated_at desc);
alter table public.personal_notes enable row level security;
revoke all on table public.personal_notes from anon;
grant select, insert, update, delete on table public.personal_notes to authenticated;
grant all privileges on table public.personal_notes to service_role;

drop policy if exists "personal_notes_select_own" on public.personal_notes;
create policy "personal_notes_select_own" on public.personal_notes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "personal_notes_insert_own" on public.personal_notes;
create policy "personal_notes_insert_own" on public.personal_notes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "personal_notes_update_own" on public.personal_notes;
create policy "personal_notes_update_own" on public.personal_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "personal_notes_delete_own" on public.personal_notes;
create policy "personal_notes_delete_own" on public.personal_notes for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_personal_note_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists personal_notes_touch_updated_at on public.personal_notes;
create trigger personal_notes_touch_updated_at before update on public.personal_notes for each row execute function public.touch_personal_note_updated_at();
