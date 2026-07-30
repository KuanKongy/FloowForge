-- FlowForge: schema changes from the 2026-07 platform audit (docs/AUDIT.md).
-- Apply via the Supabase SQL editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- S3: scope public run reads to the trigger that created the run.
--
-- The public status/result endpoints used to match on `flow_id`, so anyone
-- holding a form link could read every run of that flow — including the
-- owner's private runs from the editor. Runs now record their originating
-- trigger and the public endpoints filter on it.
-- ---------------------------------------------------------------------------
alter table public.runs
  add column if not exists trigger_id uuid references public.triggers(id) on delete set null;

create index if not exists runs_trigger_id_idx on public.runs (trigger_id);

-- ---------------------------------------------------------------------------
-- F2: `deepseek` is offered by the API schema, the shared types, and the UI,
-- but was missing from the enum, so creating one failed with a Postgres error.
-- ---------------------------------------------------------------------------
alter type provider_kind add value if not exists 'deepseek';

-- ---------------------------------------------------------------------------
-- F5: run_events had SELECT-only RLS, so the user-scoped DELETE in
-- routers/runs.py silently affected zero rows. Deletion is handled by the FK
-- cascade from runs; this policy makes an explicit cleanup possible too.
-- ---------------------------------------------------------------------------
drop policy if exists run_events_owner_delete on public.run_events;
create policy run_events_owner_delete on public.run_events
  for delete using (
    exists (select 1 from public.runs r where r.id = run_events.run_id and r.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- S9: `run-media` was a public bucket with a blanket read policy, so every
-- tenant's generated images and audio were world-readable forever via unsigned
-- URLs. The bucket becomes private; the API issues short-lived signed URLs.
-- ---------------------------------------------------------------------------
update storage.buckets
  set public = false,
      file_size_limit = 52428800
  where id = 'run-media';

drop policy if exists "run-media public read" on storage.objects;

-- Owners may read their own run media directly (path prefix is `{run_id}/…`).
-- The worker writes with the service role, which bypasses RLS.
drop policy if exists "run-media owner read" on storage.objects;
create policy "run-media owner read"
  on storage.objects for select
  using (
    bucket_id = 'run-media'
    and exists (
      select 1 from public.runs r
      where r.user_id = auth.uid()
        and r.id::text = split_part(storage.objects.name, '/', 1)
    )
  );

-- ---------------------------------------------------------------------------
-- S10: the editor subscribed to broadcast topic `run:{id}` as a *public*
-- channel, so anyone holding the anon key who knew a run UUID could stream
-- another tenant's node inputs and outputs live. Clients now connect with
-- `private: true`, which makes Realtime enforce RLS on `realtime.messages`.
--
-- The server keeps broadcasting through the REST endpoint with the service
-- role, which bypasses these policies.
-- ---------------------------------------------------------------------------
alter table if exists realtime.messages enable row level security;

drop policy if exists "run channel owner read" on realtime.messages;
create policy "run channel owner read"
  on realtime.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.runs r
      where r.user_id = auth.uid()
        and r.id::text = replace(realtime.topic(), 'run:', '')
    )
  );
