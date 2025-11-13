# Deployment

FlowForge needs four hosted pieces:

1. Next.js frontend.
2. FastAPI backend.
3. Background worker.
4. Supabase Postgres/Auth/Realtime plus Redis.

## Best Cheap Setup

For the current architecture, the best low-cost setup is:

- **Frontend:** Vercel Hobby.
- **Database/Auth/Realtime:** Supabase hosted project.
- **Redis:** Upstash free or pay-as-you-go Redis.
- **API + worker:** Railway, Fly.io, or Render as two separate processes from
  the same repo.

My recommendation is **Vercel + Supabase + Upstash + Railway** for the first
production deployment. It is simple, cheap at low traffic, and avoids forcing
the worker into a serverless environment where long-running queue consumption
is awkward.

Fly.io is often cheaper once you are comfortable with Docker and regions.
Railway is usually faster to get running. Render is fine too, but free/cheap
instances may sleep, which is unpleasant for webhook and schedule reliability.

## Required Environment

### Web

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

### API And Worker

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `WEB_ORIGIN`
- `PUBLIC_API_URL`
- `OPENAI_API_KEY`
- `GEMINI_KEY`
- `DEEPSEEK_API_KEY`
- `CLOUDFLARE_ID`
- `CLOUDFLARE_KEY`

Provider keys can be empty if you only want users to run with their own
integrations, but platform defaults need keys.

## Supabase Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/*.sql`.
3. Enable Realtime for `run_events` if not already included by migration.
4. Enable email auth.
5. Enable Google provider if using Google login.
6. Set Site URL to the production web URL.
7. Add redirect URLs:

```text
https://your-domain.com/auth/callback
https://your-domain.com/**
http://localhost:3000/auth/callback
http://localhost:3000/**
```

In Google Cloud, the authorized redirect URI should be the Supabase callback:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

## Process Commands

Frontend on Vercel:

```bash
cd web
npm install
npm run build
npm run start
```

API without Docker:

```bash
pip install -r api/requirements-api.txt
uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Worker without Docker:

```bash
pip install -r api/requirements-worker.txt
python -m api.worker
```

API with Docker:

```bash
docker build -f Dockerfile.api -t flowforge-api .
docker run --env-file api/.env -p 5001:5001 flowforge-api
```

Worker with Docker:

```bash
docker build -f Dockerfile.worker -t flowforge-worker .
docker run --env-file api/.env flowforge-worker
```

## Host Setup

### Vercel Web

Create a Vercel project from the repo and set:

- Root Directory: `web`
- Build Command: `npm run build`
- Output: Vercel default for Next.js
- Environment:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_API_URL`

### Railway API

Create one Railway service for the API:

- Builder: Dockerfile
- Dockerfile path: `Dockerfile.api`
- Port: Railway-provided `$PORT`
- Environment: all API variables listed above.

### Railway Worker

Create a second Railway service from the same repo:

- Builder: Dockerfile
- Dockerfile path: `Dockerfile.worker`
- No public port required.
- Environment: same as API.

The API and worker must point at the same `REDIS_URL`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY`.

## Health Checks

Before public launch:

- Sign up with email.
- Sign in with Google.
- Create and save a flow.
- Run Text AI with a platform key.
- Run Text AI with a user integration key.
- Upload Filebox into File Parser.
- Create a webhook trigger and call it from `curl`.
- Create a schedule trigger and confirm it appears in upcoming triggers.
- Check Runs filters, run detail timeline, and delete run.

## Deployment Choice I Need From You

Pick one backend host:

- **Railway:** easiest first deploy, good for API plus worker, usually the
  least setup friction.
- **Fly.io:** cheapest and most controlled after Docker setup, better when you
  want to keep API/worker close to a region.
- **Render:** simple UI, but sleeping instances can hurt schedules/webhooks on
  low tiers.

For this project right now, I would choose **Railway for API/worker, Vercel for
web, Supabase for database/auth, and Upstash for Redis**.

## Owner Checklist

- Choose and create the backend host. Recommended: Railway.
- Create a Supabase project and apply the SQL migrations.
- Create an Upstash Redis database and copy its Redis URL.
- Create a Vercel project with root directory `web`.
- Create two backend services: one from `Dockerfile.api`, one from
  `Dockerfile.worker`.
- Use `api/requirements-api.txt` for the API and `api/requirements-worker.txt`
  for the worker. Keep `api/requirements.txt` for local/dev installs.
- Set all web env vars in Vercel.
- Set all API/worker env vars in Railway.
- Update Supabase Auth Site URL and Redirect URLs to the production web URL.
- Configure Google OAuth in Supabase and Google Cloud if Google login is used.
- Set `WEB_ORIGIN` to the production web URL.
- Set `PUBLIC_API_URL` and `NEXT_PUBLIC_API_URL` to the production API URL.
- Run the health-check list above before sharing the app.
