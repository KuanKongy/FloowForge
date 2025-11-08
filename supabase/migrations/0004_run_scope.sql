-- Per-trigger run scope, subflow lineage, per-node timing, and the new
-- node_skipped / run_cancelled event kinds.

alter table public.runs
  add column if not exists start_node_ids jsonb,
  add column if not exists parent_run_id uuid references public.runs(id) on delete set null;

create index if not exists runs_parent_run_id_idx on public.runs(parent_run_id);

alter table public.run_events
  add column if not exists duration_ms integer;

-- New event kinds. Postgres enum mutation must be done outside transactions in
-- some clients; the supabase CLI handles this fine for migrations. ``if not
-- exists`` keeps the migration idempotent on re-runs.
do $$ begin
  alter type run_event_kind add value if not exists 'node_skipped';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type run_event_kind add value if not exists 'run_cancelled';
exception when duplicate_object then null; end $$;
