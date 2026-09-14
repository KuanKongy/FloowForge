-- FloowForge: consolidated schema (merges 0001–0008).
-- Apply via Supabase SQL editor or `supabase db push`.
-- If resetting, run 000_nuke.sql first.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trigger_kind as enum (
    'whole', 'manual', 'webhook_in', 'schedule_in', 'public_in', 'subflow',
    -- Legacy run kinds kept for older rows/projects.
    'webhook', 'schedule', 'public'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_event_kind as enum (
    'run_started', 'run_succeeded', 'run_failed', 'run_cancelled',
    'node_started', 'node_succeeded', 'node_failed', 'node_skipped',
    'log'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type custom_node_kind as enum ('subflow', 'prompt_template');
exception when duplicate_object then null; end $$;

do $$ begin
  create type provider_kind as enum ('openai', 'gemini', 'cloudflare');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- flows + versions
-- ---------------------------------------------------------------------------
create table if not exists public.flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled flow',
  description text,
  tags text[] not null default '{}',
  is_subflow boolean not null default false,
  is_published boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flows_user_id_idx on public.flows(user_id);
create index if not exists flows_user_subflow_idx on public.flows(user_id, is_subflow);

create table if not exists public.flow_versions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  version int not null,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (flow_id, version)
);

create index if not exists flow_versions_flow_id_idx on public.flow_versions(flow_id);

alter table public.flows
  add constraint flows_current_version_fk
  foreign key (current_version_id) references public.flow_versions(id) on delete set null
  not valid;
alter table public.flows validate constraint flows_current_version_fk;

-- ---------------------------------------------------------------------------
-- runs + run_events
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  flow_version_id uuid not null references public.flow_versions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status run_status not null default 'queued',
  trigger_kind trigger_kind not null default 'manual',
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  start_node_ids jsonb,
  parent_run_id uuid references public.runs(id) on delete set null
);

create index if not exists runs_user_id_idx on public.runs(user_id);
create index if not exists runs_flow_id_idx on public.runs(flow_id);
create index if not exists runs_status_idx on public.runs(status);
create index if not exists runs_parent_run_id_idx on public.runs(parent_run_id);

create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  node_id text,
  kind run_event_kind not null,
  payload jsonb not null default '{}'::jsonb,
  duration_ms integer,
  ts timestamptz not null default now()
);

create index if not exists run_events_run_id_ts_idx on public.run_events(run_id, ts);

-- ---------------------------------------------------------------------------
-- triggers + webhook secrets
-- ---------------------------------------------------------------------------
create table if not exists public.triggers (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'webhook', 'schedule', 'manual',
    'incoming_webhook', 'outgoing_webhook', 'public_form'
  )),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  callback_url text,
  entry_node_id text,
  show_outputs boolean not null default false,
  output_node_ids text[]
);

create index if not exists triggers_flow_id_idx on public.triggers(flow_id);
create index if not exists triggers_user_id_idx on public.triggers(user_id);

create table if not exists public.webhook_secrets (
  trigger_id uuid primary key references public.triggers(id) on delete cascade,
  token text not null unique,
  secret text
);

create index if not exists webhook_secrets_token_idx on public.webhook_secrets(token);

-- ---------------------------------------------------------------------------
-- custom_nodes
-- ---------------------------------------------------------------------------
create table if not exists public.custom_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind custom_node_kind not null,
  name text not null,
  icon text,
  schema jsonb not null default '{"inputs":[],"outputs":[]}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists custom_nodes_user_id_idx on public.custom_nodes(user_id);

-- ---------------------------------------------------------------------------
-- integrations (provider keys per user)
-- ---------------------------------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider provider_kind not null,
  label text not null default '',
  encrypted_credentials text,
  created_at timestamptz not null default now()
);

create unique index if not exists integrations_user_provider_label_idx
  on public.integrations(user_id, provider, label);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flows_touch_updated_at on public.flows;
create trigger flows_touch_updated_at
  before update on public.flows
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.flows enable row level security;
alter table public.flow_versions enable row level security;
alter table public.runs enable row level security;
alter table public.run_events enable row level security;
alter table public.triggers enable row level security;
alter table public.webhook_secrets enable row level security;
alter table public.custom_nodes enable row level security;
alter table public.integrations enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (auth.uid() = id);

drop policy if exists flows_owner_all on public.flows;
create policy flows_owner_all on public.flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists flow_versions_owner_all on public.flow_versions;
create policy flow_versions_owner_all on public.flow_versions
  for all using (
    exists (select 1 from public.flows f where f.id = flow_versions.flow_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.flows f where f.id = flow_versions.flow_id and f.user_id = auth.uid())
  );

drop policy if exists runs_owner_all on public.runs;
create policy runs_owner_all on public.runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists run_events_owner_read on public.run_events;
create policy run_events_owner_read on public.run_events
  for select using (
    exists (select 1 from public.runs r where r.id = run_events.run_id and r.user_id = auth.uid())
  );

drop policy if exists triggers_owner_all on public.triggers;
create policy triggers_owner_all on public.triggers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists webhook_secrets_owner_read on public.webhook_secrets;
create policy webhook_secrets_owner_read on public.webhook_secrets
  for select using (
    exists (select 1 from public.triggers t where t.id = webhook_secrets.trigger_id and t.user_id = auth.uid())
  );

drop policy if exists custom_nodes_owner_all on public.custom_nodes;
create policy custom_nodes_owner_all on public.custom_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists integrations_owner_all on public.integrations;
create policy integrations_owner_all on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.run_events;
