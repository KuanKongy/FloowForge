-- Enable Supabase Realtime for run_events so the editor can subscribe to
-- node-level execution updates via channel run:{run_id}.
--
-- We deliberately do NOT add `runs` to the publication: the executor and
-- /runs/{id}/cancel push status updates over Realtime "broadcast" on the
-- same `run:{run_id}` channel, so a postgres_changes feed on `runs` would
-- duplicate (and could disagree with) those messages.

alter publication supabase_realtime add table public.run_events;
