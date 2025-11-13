# Architecture

FlowForge has three main runtime layers:

- `web/`: Next.js application for public pages, auth pages, the dashboard, and
  the React Flow editor.
- `api/`: FastAPI service for REST routes, trigger ingress, workflow execution,
  provider calls, scheduling, and background work.
- `supabase/`: hosted Postgres, Auth, Realtime, RLS policies, and migrations.

`packages/shared/` contains TypeScript types used by the frontend. The API has
matching Pydantic schemas in `api/schemas.py`.

## Request Flow

1. A user signs in with Supabase Auth. The frontend stores the Supabase session.
2. Dashboard and editor requests call `NEXT_PUBLIC_API_URL` with the user's
   bearer token.
3. FastAPI validates the token in `api/deps.py`, then uses Supabase service
   credentials for data access that must bypass RLS, such as worker writes.
4. Flows are saved as `flows` plus immutable `flow_versions`.
5. A run is created from a trigger, public form, webhook, or editor action.
6. The run is queued in Redis. If Redis or the worker is unavailable in local
   development, the API can run the flow in a FastAPI background task.
7. The worker loads the saved graph version, computes the active subgraph,
   validates it, executes nodes, stores events, and updates the run.
8. The editor and run detail pages receive `run_events` over Supabase Realtime.

## Execution Model

The engine treats the graph as a DAG. A trigger run can start from selected
node ids, so a button or webhook only executes its downstream branch. Nodes
outside that branch are skipped for that run.

Each node has a wait strategy:

- `barrier`: wait for all in-scope parents.
- `race`: run after the first in-scope parent succeeds.

Every node executor returns a normalized output payload. AI providers return
`ProviderResult`, which may contain text, bytes, mime type, or structured JSON.

## Provider Model

Provider code is isolated in `api/providers/`:

- OpenAI: chat, image, and audio through OpenAI APIs.
- Gemini: text generation through `google-genai`.
- Cloudflare: direct Workers AI REST API, not AI Gateway.
- DeepSeek: OpenAI-compatible chat API.

The frontend stores friendly model labels. Backend normalizers map those labels
to actual provider model ids, which lets old saved flows continue to run when
dropdown labels change.

## Auth Model

Supabase Auth owns email/password and Google sign-in. The web app starts Google
OAuth from `/auth/google`, Supabase redirects back to `/auth/callback`, and
the callback exchanges the code for a session.

The app is not currently acting as an OAuth provider for other apps. Supabase's
OAuth Server `/oauth/consent` feature is separate and not needed for Google
login.

## Realtime Model

The API writes run events into `run_events` and broadcasts them to a channel
named `run:{run_id}`. The editor uses that stream to update node badges, active
states, sidebar rows, and final run output.
