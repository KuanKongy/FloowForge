-- Add callback_url to triggers for outgoing webhook on run completion
alter table public.triggers
  add column if not exists callback_url text;
