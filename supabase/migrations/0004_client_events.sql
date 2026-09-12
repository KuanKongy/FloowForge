-- Client-signal event log for rate limiting and abuse forensics.
--
-- Written only by the API's service-role batch flusher (api/ratelimit/events.py):
-- every 401/403/429, every mutation, every public trigger hit, plus a small
-- sample of reads. RLS is enabled with NO policies on purpose — no end user
-- can read or write this table; only the service role reaches it.
--
-- Retention: 90 days (this is what the Privacy Policy states). Prune with:
--   delete from public.client_events where ts < now() - interval '90 days';
-- or schedule it with pg_cron:
--   select cron.schedule('prune-client-events', '17 4 * * *',
--     $$delete from public.client_events where ts < now() - interval '90 days'$$);

create table if not exists public.client_events (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  user_id     uuid,
  ip          inet,
  fingerprint text,
  method      text,
  path        text,
  status      smallint,
  ua_browser  text,
  ua_os       text,
  user_agent  text,
  lang        text,
  tz          text
);

alter table public.client_events enable row level security;

create index if not exists client_events_ts_idx on public.client_events (ts);
create index if not exists client_events_user_ts_idx on public.client_events (user_id, ts);
create index if not exists client_events_ip_ts_idx on public.client_events (ip, ts);
