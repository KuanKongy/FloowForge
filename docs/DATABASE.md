# Database And Supabase

Supabase provides Postgres, Auth, Realtime, and row-level security.

## Migrations

Migrations live in `supabase/migrations/`.

- `000_nuke.sql`: destructive reset helper for local rebuilds only.
- `0001_init.sql`: core tables, enums, and triggers.

The current tracked migrations define the product tables used by the API:

- `profiles`: user profile rows created from auth users.
- `flows`: workflow metadata and current version pointer.
- `flow_versions`: immutable saved graph snapshots.
- `runs`: one execution record per run.
- `run_events`: per-node timeline events and outputs.
- `triggers`: manual, webhook, and schedule trigger definitions.
- `webhook_secrets`: public webhook token records.
- `custom_nodes`: prompt-template custom node definitions.
- `integrations`: encrypted or masked provider credential records.

## Auth

Supabase Auth owns user identity. The web app uses:

- Email/password sign-up and sign-in.
- Google social login through Supabase provider configuration.
- SSR middleware for dashboard protection.

The API validates bearer tokens through Supabase Auth and then uses the service
role key for backend-owned operations.

## Realtime

Run detail and editor pages subscribe to run-specific channels. Backend run
events are written to the database and broadcast so the UI can show immediate
node status, failures, durations, and outputs.

## RLS

Owner-scoped tables should enforce `auth.uid() = user_id`. Worker and scheduler
processes use the service role key because they need to update runs after the
initial user request has finished.

When adding a table, define:

- Primary key and timestamps.
- `user_id` when data is user-owned.
- RLS enabled.
- Select/insert/update/delete policies.
- Any service-role-only behavior documented in the API route or worker.
