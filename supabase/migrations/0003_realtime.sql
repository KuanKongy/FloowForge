-- Enable Supabase Realtime for run_events so the editor can subscribe to
-- node-level execution updates via channel run:{run_id}.
--
-- We deliberately do NOT add `runs` to the publication: the executor and
-- /runs/{id}/cancel push status updates over Realtime "broadcast" on the
-- same `run:{run_id}` channel, so a postgres_changes feed on `runs` would
-- duplicate (and could disagree with) those messages.


create or replace function public.session_account_visible_to(owner_id uuid, visibility text)
returns boolean
language sql
stable
as $$
  select visibility = 'public' or owner_id = auth.uid() or auth.role() = 'service_role';
$$;


create or replace function public.touch_session_trigger_updated_at()
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

alter publication supabase_realtime add table public.run_events;

create or replace function public.session_edge_label(name text, fallback_id uuid)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(name), ''), fallback_id::text);
$$;


create or replace function public.read_session_media_text(payload jsonb, key_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(coalesce(payload ->> key_name, '')), '');
$$;

