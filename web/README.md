# FloowForge Web

Next.js 15 (App Router) front-end.

## Layout

- `app/` — routes
  - `/` landing (public)
  - `/auth/sign-in`, `/auth/sign-up`, `/auth/callback` — Supabase Auth
  - `/app/flows` — saved flows dashboard
  - `/app/flows/[flowId]` — React Flow editor with live run state
  - `/app/runs`, `/app/runs/[runId]` — run history & detail
  - `/app/triggers` — webhook + schedule trigger management
  - `/app/custom-nodes` — Prompt-template builder
  - `/app/profile` — account email and sign out
- `components/` — shared UI (app shell, editor, ui primitives)
- `lib/` — Supabase client/server, fetch helpers
- `middleware.ts` — protects `/app/*`; sends logged-in users from `/`, `/auth/sign-in`, `/auth/sign-up` to `/app/flows`

## Google sign-in setup

For **Continue with Google** to work:

1. **Supabase** → **Authentication** → **URL configuration**: add your app origins to **Redirect URLs** (e.g. `http://localhost:3000/auth/callback` and production `https://your-domain/auth/callback`). Set **Site URL** to the primary app URL.
2. **Supabase** → **Authentication** → **Providers** → **Google**: enable and paste OAuth **Client ID** and **Client secret** from Google Cloud.
3. **Google Cloud Console** → **APIs & Services** → **Credentials** → your OAuth 2.0 Client → **Authorized redirect URIs**: include  
   `https://<your-project-ref>.supabase.co/auth/v1/callback`  
   (replace with your project ref from Supabase **Settings** → **API**.)

## Local dev

```bash
npm install
cp .env.example .env.local  # fill in Supabase + API URL
npm run dev
```

## Realtime

The editor and run detail subscribe to the Supabase Realtime channel
`run:{run_id}` via `@supabase/supabase-js`. The API broadcasts
`node_started` / `node_succeeded` / `node_failed` events as the worker walks
the graph.
