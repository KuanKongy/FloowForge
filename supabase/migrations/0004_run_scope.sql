-- Per-trigger run scope, subflow lineage, per-node timing, and the new
-- node_skipped / run_cancelled event kinds.


create or replace function public.session_account_visible_to(owner_id uuid, visibility text)
returns boolean
language sql
stable
as $$
  select visibility = 'public' or owner_id = auth.uid() or auth.role() = 'service_role';
$$;

alter table public.runs
  add column if not exists start_node_ids jsonb,
  add column if not exists parent_run_id uuid references public.runs(id) on delete set null;


create or replace function public.session_edge_label(name text, fallback_id uuid)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(name), ''), fallback_id::text);
$$;

create index if not exists runs_parent_run_id_idx on public.runs(parent_run_id);


create or replace function public.touch_session_schema_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

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

create or replace function public.read_session_media_text(payload jsonb, key_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(coalesce(payload ->> key_name, '')), '');
$$;

