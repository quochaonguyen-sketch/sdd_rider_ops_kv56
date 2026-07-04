create table if not exists public.member_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  description text,
  assignee_id uuid not null constraint member_tasks_assignee_id_fkey references public.profiles(id) on delete cascade,
  created_by uuid not null constraint member_tasks_created_by_fkey references public.profiles(id) on delete restrict,
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH')),
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_tasks_assignee_idx on public.member_tasks (assignee_id, status, due_at);
create index if not exists member_tasks_creator_idx on public.member_tasks (created_by, created_at desc);
alter table public.member_tasks enable row level security;
grant all privileges on table public.member_tasks to service_role;

create or replace function public.set_member_tasks_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_member_tasks_updated_at on public.member_tasks;
create trigger set_member_tasks_updated_at before update on public.member_tasks
for each row execute function public.set_member_tasks_updated_at();
