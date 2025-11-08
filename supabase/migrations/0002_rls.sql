-- FlowForge: row-level security policies.
-- Every table is owner-scoped via auth.uid(). The API service-role bypasses RLS
-- for system jobs (worker, scheduler, public webhook).

alter table public.profiles enable row level security;
alter table public.flows enable row level security;
alter table public.flow_versions enable row level security;
alter table public.runs enable row level security;
alter table public.run_events enable row level security;
alter table public.triggers enable row level security;
alter table public.webhook_secrets enable row level security;
alter table public.custom_nodes enable row level security;
alter table public.integrations enable row level security;

-- profiles: users can see and update their own row.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (auth.uid() = id);

-- flows
drop policy if exists flows_owner_all on public.flows;
create policy flows_owner_all on public.flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- flow_versions: owner via flow_id
drop policy if exists flow_versions_owner_all on public.flow_versions;
create policy flow_versions_owner_all on public.flow_versions
  for all using (
    exists (select 1 from public.flows f where f.id = flow_versions.flow_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.flows f where f.id = flow_versions.flow_id and f.user_id = auth.uid())
  );

-- runs
drop policy if exists runs_owner_all on public.runs;
create policy runs_owner_all on public.runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- run_events: read-only via parent run; inserts come from service role
drop policy if exists run_events_owner_read on public.run_events;
create policy run_events_owner_read on public.run_events
  for select using (
    exists (select 1 from public.runs r where r.id = run_events.run_id and r.user_id = auth.uid())
  );

-- triggers
drop policy if exists triggers_owner_all on public.triggers;
create policy triggers_owner_all on public.triggers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- webhook_secrets: owner-read via trigger; service role manages
drop policy if exists webhook_secrets_owner_read on public.webhook_secrets;
create policy webhook_secrets_owner_read on public.webhook_secrets
  for select using (
    exists (select 1 from public.triggers t where t.id = webhook_secrets.trigger_id and t.user_id = auth.uid())
  );

-- custom_nodes
drop policy if exists custom_nodes_owner_all on public.custom_nodes;
create policy custom_nodes_owner_all on public.custom_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- integrations
drop policy if exists integrations_owner_all on public.integrations;
create policy integrations_owner_all on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
