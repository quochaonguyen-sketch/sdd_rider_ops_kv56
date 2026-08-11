create table if not exists public.ai_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Cuộc trò chuyện mới' check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_conversations_id_user_idx
  on public.ai_conversations (id, user_id);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  page_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_messages_owned_conversation_fk
    foreign key (conversation_id, user_id)
    references public.ai_conversations(id, user_id)
    on delete cascade
);

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_user_created_idx
  on public.ai_messages (user_id, created_at desc);
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at asc);

alter table public.ai_user_preferences enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

revoke all on table public.ai_user_preferences, public.ai_conversations, public.ai_messages from anon;
grant select, insert, update, delete on table public.ai_user_preferences, public.ai_conversations, public.ai_messages to authenticated;
grant all privileges on table public.ai_user_preferences, public.ai_conversations, public.ai_messages to service_role;

drop policy if exists "ai_user_preferences_own" on public.ai_user_preferences;
create policy "ai_user_preferences_own" on public.ai_user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_conversations_own" on public.ai_conversations;
create policy "ai_conversations_own" on public.ai_conversations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_ai_memory_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_user_preferences_touch_updated_at on public.ai_user_preferences;
create trigger ai_user_preferences_touch_updated_at
  before update on public.ai_user_preferences
  for each row execute function public.touch_ai_memory_updated_at();

drop trigger if exists ai_conversations_touch_updated_at on public.ai_conversations;
create trigger ai_conversations_touch_updated_at
  before update on public.ai_conversations
  for each row execute function public.touch_ai_memory_updated_at();
