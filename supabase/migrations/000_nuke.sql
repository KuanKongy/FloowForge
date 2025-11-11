-- FlowForge: DROP EVERYTHING.
-- Run this in the Supabase SQL editor to wipe all FlowForge tables, types,
-- functions, and triggers. Then run 0001_init.sql to recreate from scratch.
--
-- WARNING: This destroys all data. Only use for dev/testing resets.

-- Drop tables in dependency order (children before parents).
drop table if exists public.webhook_secrets cascade;
drop table if exists public.run_events cascade;
drop table if exists public.runs cascade;
drop table if exists public.triggers cascade;
drop table if exists public.flow_versions cascade;
drop table if exists public.flows cascade;
drop table if exists public.custom_nodes cascade;
drop table if exists public.integrations cascade;
drop table if exists public.profiles cascade;

-- Drop functions.
drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;

-- Drop enums.
drop type if exists public.run_status cascade;
drop type if exists public.trigger_kind cascade;
drop type if exists public.run_event_kind cascade;
drop type if exists public.custom_node_kind cascade;
drop type if exists public.provider_kind cascade;
