# Supabase

Apply migrations in order. Either:

- **Dashboard:** paste each SQL file into the SQL editor in order.
- **CLI:** `supabase db push` after linking with `supabase link --project-ref <ref>`.

> **Important:** every migration in this folder must be applied for the API to
> work. The API probes for required columns at boot and logs a warning naming
> the missing one. If `POST /flows/:id/runs` returns a 400 mentioning
> `start_node_ids`, or the public webhook fails on `trigger_id`, a migration
> has not been applied.

## Files

- `migrations/000_nuke.sql` — drops everything. Only for a clean reset.
- `migrations/0001_init.sql` — the consolidated schema: enums, tables
  (`profiles`, `flows`, `flow_versions`, `runs`, `run_events`, `triggers`,
  `webhook_secrets`, `custom_nodes`, `integrations`), the `handle_new_user`
  trigger, all RLS policies, and the `run_events` realtime publication.
- `migrations/0002_run_media_bucket.sql` — creates the `run-media` storage
  bucket for generated images and audio.
- `migrations/0003_audit_fixes.sql` — changes from the platform audit
  (`docs/AUDIT.md`): adds `runs.trigger_id` so public endpoints can scope reads
  to the trigger that created a run, adds the `deepseek` provider enum value,
  adds a `run_events` delete policy, makes `run-media` **private** (media is
  served through signed URLs), and adds the RLS policy that lets the editor
  subscribe to its own run channel as a private Realtime topic.

Earlier split files (`0002_rls.sql`, `0003_realtime.sql`, `0004_run_scope.sql`)
were merged into `0001_init.sql` and no longer exist.

## Auth setup

1. Enable Email and Google providers in Authentication → Providers.
2. Add `http://localhost:3000/auth/callback` and your production URL to the allow-list.
3. The `handle_new_user()` trigger automatically creates a `profiles` row on signup.

## Realtime setup

`0003_audit_fixes.sql` enables RLS on `realtime.messages` and adds a policy
scoping the `run:{run_id}` broadcast topic to the run's owner. The editor
subscribes with `private: true`, so this policy is required for live run
updates to appear.
