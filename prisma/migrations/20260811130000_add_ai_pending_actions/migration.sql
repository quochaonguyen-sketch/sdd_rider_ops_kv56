create table if not exists public.ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('OFF_RESCHEDULE')),
  status text not null default 'PENDING' check (status in ('PENDING','EXECUTED','CANCELLED','EXPIRED','FAILED')),
  payload jsonb not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_pending_actions_user_created_idx
  on public.ai_pending_actions (user_id, created_at desc);

alter table public.ai_pending_actions enable row level security;
revoke all on table public.ai_pending_actions from anon;
grant select on table public.ai_pending_actions to authenticated;
grant all privileges on table public.ai_pending_actions to service_role;

drop policy if exists "ai_pending_actions_select_own" on public.ai_pending_actions;
create policy "ai_pending_actions_select_own" on public.ai_pending_actions
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.execute_ai_off_reschedule(p_action_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.ai_pending_actions%rowtype;
  rider_code_value text;
  from_date_value date;
  to_date_value date;
  attendance_id_value uuid;
  off_request_id_value uuid;
  off_status_value text;
begin
  select * into pending from public.ai_pending_actions where id = p_action_id for update;
  if pending.id is null or pending.user_id <> p_actor_id then raise exception 'Action không tồn tại hoặc không thuộc account này'; end if;
  if pending.status <> 'PENDING' then raise exception 'Action đã được xử lý'; end if;
  if pending.expires_at <= now() then
    update public.ai_pending_actions set status = 'EXPIRED', updated_at = now() where id = p_action_id;
    raise exception 'Action đã hết hạn';
  end if;

  rider_code_value := pending.payload->>'rider_code';
  from_date_value := (pending.payload->>'from_date')::date;
  to_date_value := (pending.payload->>'to_date')::date;
  attendance_id_value := nullif(pending.payload->>'attendance_id', '')::uuid;
  off_request_id_value := nullif(pending.payload->>'off_request_id', '')::uuid;
  off_status_value := pending.payload->>'off_status';

  if exists (
    select 1 from public.attendance_logs
    where rider_code = rider_code_value and work_date = to_date_value
      and (attendance_id_value is null or id <> attendance_id_value)
  ) then raise exception 'Rider đã có lịch ở ngày đích'; end if;

  if off_request_id_value is not null and exists (
    select 1 from public.rider_off_requests
    where rider_id = (pending.payload->>'rider_id')::uuid and off_date = to_date_value and id <> off_request_id_value
  ) then raise exception 'Rider đã có yêu cầu OFF ở ngày đích'; end if;

  if attendance_id_value is not null then
    update public.attendance_logs set work_date = to_date_value, updated_at = now()
    where id = attendance_id_value and rider_code = rider_code_value and work_date = from_date_value;
    if not found then raise exception 'Lịch OFF nguồn đã thay đổi; hãy tạo preview mới'; end if;
  else
    insert into public.attendance_logs (rider_id, rider_code, work_date, status, raw_data)
    values ((pending.payload->>'rider_id')::uuid, rider_code_value, to_date_value, off_status_value,
      jsonb_build_object('source','ai_off_reschedule','action_id',p_action_id));
  end if;

  if off_request_id_value is not null then
    update public.rider_off_requests set
      off_date = to_date_value,
      updated_at = now(),
      email_notification_status = 'PENDING',
      email_notification_error = 'Lịch OFF đã được đổi bởi AI; cần gửi lại thông báo ngày mới',
      email_notified_at = null
    where id = off_request_id_value and off_date = from_date_value and status = 'APPROVED';
    if not found then raise exception 'Yêu cầu OFF nguồn đã thay đổi; hãy tạo preview mới'; end if;
  end if;

  update public.ai_pending_actions set status = 'EXECUTED', executed_at = now(), updated_at = now() where id = p_action_id;
  insert into public.activity_logs (entity_type, entity_id, action, message, raw_data)
  values ('ai_off_reschedule', p_action_id, 'executed',
    format('AI moved OFF for %s from %s to %s', rider_code_value, from_date_value, to_date_value),
    jsonb_build_object('actor_id',p_actor_id,'rider_id',pending.payload->>'rider_id','rider_code',rider_code_value,'from_date',from_date_value,'to_date',to_date_value));

  return jsonb_build_object('action_id',p_action_id,'rider_code',rider_code_value,'from_date',from_date_value,'to_date',to_date_value,'status','EXECUTED');
end;
$$;

revoke all on function public.execute_ai_off_reschedule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.execute_ai_off_reschedule(uuid, uuid) to service_role;

drop trigger if exists ai_pending_actions_touch_updated_at on public.ai_pending_actions;
create trigger ai_pending_actions_touch_updated_at
  before update on public.ai_pending_actions
  for each row execute function public.touch_ai_memory_updated_at();
