-- Run once in Supabase SQL editor to allow the AI "auto OFF schedule" action type.
-- The web app falls back to OFF_RESCHEDULE until this runs, so the SQL is optional
-- but recommended to keep action types accurate in logs.
alter table public.ai_pending_actions
  drop constraint if exists ai_pending_actions_action_type_check;

alter table public.ai_pending_actions
  add constraint ai_pending_actions_action_type_check
  check (action_type in ('OFF_RESCHEDULE', 'OFF_AUTO_SCHEDULE'));
