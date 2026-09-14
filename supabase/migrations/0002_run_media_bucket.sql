-- FloowForge: storage bucket for run-generated media (images, audio).
-- Apply via Supabase SQL editor or `supabase db push`.
--
-- The API creates this bucket on first upload (see api/storage.py), so this
-- migration exists so a fresh project provisioned from SQL alone matches
-- production. Generated media used to travel through the graph as base64
-- `data:` URLs, which exceeded the ~256 KB Supabase Realtime message limit —
-- the `node_succeeded` broadcast carrying an image was rejected with 422 and
-- the editor never rendered it.

insert into storage.buckets (id, name, public, file_size_limit)
values ('run-media', 'run-media', true, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Objects are written by the worker with the service role key (which bypasses
-- RLS) and read by the editor over the public URL, so only a read policy is
-- needed. Paths are `{run_id}/{node_id}-{random}.{ext}`, so URLs are not
-- guessable from a flow id alone.
do $$ begin
  create policy "run-media public read"
    on storage.objects for select
    using (bucket_id = 'run-media');
exception when duplicate_object then null; end $$;
