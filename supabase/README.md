# Supabase

Apply migrations in order. Either:

- **Dashboard:** paste each SQL file into the SQL editor in order.
- **CLI:** `supabase db push` after linking with `supabase link --project-ref <ref>`.

> **Important:** every migration in this folder must be applied for the API to
> work. If you upgraded an existing project and `POST /flows/:id/runs` returns
> a 400 with `start_node_ids` or `parent_run_id` in the message, you forgot to
> run `0004_run_scope.sql` — apply it and the run lifecycle works again. The
> API logs a warning at boot when migration 0004 is missing.

## Files

- `migrations/0001_init.sql` — tables, enums, triggers (`profiles`, `flows`, `flow_versions`, `runs`, `run_events`, `triggers`, `webhook_secrets`, `custom_nodes`, `integrations`).
- `migrations/0002_rls.sql` — RLS policies. Every owner-scoped table requires `auth.uid() = user_id`. The API uses the service role to bypass RLS for the worker, scheduler, and public webhook.
- `migrations/0003_realtime.sql` — adds `run_events` to the `supabase_realtime` publication so the editor can subscribe to per-node run updates.
- `migrations/0004_run_scope.sql` — per-trigger run scope (`runs.start_node_ids`), subflow lineage (`runs.parent_run_id`), per-node timing (`run_events.duration_ms`), and the `node_skipped` / `run_cancelled` event kinds. **Required** for the run lifecycle and the run sidebar.

## Auth setup

1. Enable Email and Google providers in Authentication → Providers.
2. Add `http://localhost:3000/auth/callback` and your production URL to the allow-list.
3. The `handle_new_user()` trigger automatically creates a `profiles` row on signup.
