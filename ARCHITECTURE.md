# FloowForge Architecture

FloowForge is an event-driven, no-code AI workflow builder. Users design
directed acyclic graphs (DAGs) of nodes in a visual canvas, then execute them
via manual triggers, webhooks, schedules, or public forms.

## Directory Structure

```
FloowForge/
├── api/                    # FastAPI backend
│   ├── engine/             # Workflow execution engine
│   │   ├── executor.py     # Async DAG runner (barrier/race semantics)
│   │   ├── graph.py        # Topo sort, scope computation, adjacency
│   │   ├── context.py      # ExecutionContext (emit events, cache)
│   │   └── nodes/          # Per-node-type executors (llm, media, etc.)
│   ├── providers/          # AI provider adapters (OpenAI, Gemini, Cloudflare)
│   ├── routers/            # FastAPI route modules (flows, runs, triggers, …)
│   ├── queue.py            # Redis Streams enqueue helper
│   ├── worker.py           # Blocking Redis Streams worker process
│   ├── scheduler.py        # APScheduler cron trigger driver
│   ├── config.py           # Pydantic settings from .env
│   ├── db.py               # Supabase REST + Realtime client
│   ├── schemas.py          # Pydantic request/response models
│   └── main.py             # FastAPI app factory + lifespan
├── web/                    # Next.js 15 frontend
│   ├── app/                # App Router pages
│   │   ├── app/            # Authenticated dashboard pages
│   │   ├── auth/           # Sign-in / sign-up
│   │   └── p/[token]/      # Public form page
│   ├── components/
│   │   ├── editor/         # React Flow canvas, nodes, palette, sidebar
│   │   └── ui/             # Shared UI primitives (Button, ConfirmDialog)
│   └── lib/                # API client, Supabase helpers, utils
├── packages/shared/        # TypeScript types shared between web and API
├── supabase/
│   └── migrations/         # SQL migrations (0001–0003)
└── ARCHITECTURE.md         # This file
```

## Tech Stack

| Layer          | Technology                                       |
|----------------|--------------------------------------------------|
| Frontend       | Next.js 15 (App Router, Turbopack), React 19     |
| Canvas         | React Flow (@xyflow/react)                       |
| Styling        | Tailwind CSS 4, Framer Motion                    |
| Backend API    | FastAPI, Pydantic v2                              |
| Job Queue      | Redis Streams (custom blocking worker)           |
| Scheduling     | APScheduler (in-process, async)                  |
| Database       | Supabase (PostgreSQL, Auth, Realtime, RLS)       |
| AI Providers   | OpenAI, Google Gemini, Cloudflare Workers AI, DeepSeek |
| Auth           | Supabase Auth (JWT, SSR middleware)              |

## Execution Pipeline

```
Trigger (button/webhook/schedule/form)
  → API creates a `runs` row (status=queued)
  → API pushes {run_id, start_node_ids} to Redis Stream via XADD
  → Worker picks up job via XREADGROUP BLOCK
  → executor.run_flow():
      1. Load run + flow version graph from Supabase
      2. Compute scope (start ∪ downstream)
      3. Validate (cycle check via Kahn's algorithm)
      4. For each node in scope (up to 8 concurrent):
         a. Wait for parents (barrier: all, or race: any)
         b. Build inputs from parent outputs + boundary snapshots
         c. Call node executor (LLM, media, passthrough, subflow, …)
         d. Emit node_started / node_succeeded / node_failed events
      5. Final output = last completed sink node
      6. Update run status (succeeded/failed/cancelled)
  → Worker ACKs the stream message
  → If callback_url on trigger: POST result to external system
```

### Wait Strategies

Each node declares a `wait_strategy`:
- **barrier** (default): execute when ALL in-scope parents complete
- **race**: execute when ANY in-scope parent completes

### Node Types

| Type             | Executor          | Description                              |
|------------------|-------------------|------------------------------------------|
| textbox          | passthrough       | Static text, pass-through I/O            |
| imagebox         | passthrough       | Image display/pass-through               |
| audiobox         | passthrough       | Audio display/pass-through               |
| filebox          | file              | File upload; opaque pass-through         |
| chatbox          | chat              | Multi-turn conversation                  |
| header           | passthrough       | Display-only heading                     |
| button           | trigger_input     | Manual run trigger                       |
| webhook_in       | trigger_input     | External HTTP trigger                    |
| manual_in        | trigger_input     | API / public-form trigger                |
| schedule_in      | trigger_input     | Cron / scheduled trigger                 |
| llm              | llm               | Text AI (GPT, Gemini, Llama)             |
| imagegen         | media             | Image generation (GPT Image 1, Flux)     |
| audiogen         | media             | Audio generation (TTS)                   |
| fileparser       | fileparser        | File parsing (PDF → text, via PyMuPDF)   |
| subflow          | subflow           | Run another flow as a step               |
| prompt_template  | prompt_template   | Custom Jinja2 prompt → LLM              |

## Worker Architecture

The worker uses Redis Streams with consumer groups for reliable job delivery:

1. `XGROUP CREATE floowforge:jobs workers $ MKSTREAM` on startup
2. `XAUTOCLAIM` to recover pending messages from crashed consumers
3. `XREADGROUP GROUP workers {consumer} BLOCK 30000` for new jobs
4. `XACK` + `XDEL` only when `run_flow` returns. A raised exception leaves the
   message pending so `XAUTOCLAIM` can redeliver it.
5. Delivery counts are kept in the Redis hash `floowforge:jobs:retries`, so they
   survive reconnects. After `MAX_RETRIES` (3) the message is dead-lettered and
   its run is marked `failed`.
6. `_recover_pending` sweeps for messages abandoned by crashed workers every
   60s, not only at startup.

Idle overhead: ~120 Redis commands/hour (vs ~7200 with polling).

## Database Schema

Key tables (Supabase/PostgreSQL):
- `flows` — user workflows with `current_version_id`
- `flow_versions` — immutable graph snapshots (nodes + edges JSON)
- `runs` — execution records (status, input, output, timing)
- `run_events` — per-node execution events for real-time feedback
- `triggers` — webhook, schedule, manual trigger definitions
- `webhook_secrets` — token/secret pairs for incoming webhooks
- `custom_nodes` — user-defined prompt templates
- `integrations` — BYO API keys for AI providers

All tables use RLS (Row Level Security) scoped to `auth.uid()`. Note that
`run_events` and `webhook_secrets` are read-only to owners; writes go through
the service role. See `docs/AUDIT.md` for the full policy matrix.

## Deployment

### Prerequisites
- Node.js 18+, Python 3.12+
- Supabase project (or local via `supabase start`)
- Redis instance (local, Docker, or Upstash)

### Environment Variables

Copy `api/.env.example` and `web/.env.example`, then fill in:

| Variable                     | Where  | Purpose                            |
|------------------------------|--------|------------------------------------|
| `SUPABASE_URL`               | API    | Supabase project URL               |
| `SUPABASE_ANON_KEY`          | Both   | Supabase anonymous key             |
| `SUPABASE_SERVICE_ROLE_KEY`  | API    | Supabase service role key          |
| `REDIS_URL`                  | API    | Redis connection string            |
| `OPENAI_API_KEY`             | API    | OpenAI API key                     |
| `GEMINI_KEY`                 | API    | Google Gemini API key              |
| `DEEPSEEK_API_KEY`           | API    | DeepSeek API key                   |
| `CREDENTIALS_KEY`            | API    | AES key encrypting BYO provider credentials |
| `ENVIRONMENT`                | API    | `production` (default) or `development` |
| `CLOUDFLARE_ID`              | API    | Cloudflare account ID              |
| `CLOUDFLARE_KEY`             | API    | Cloudflare API token               |
| `WEB_ORIGIN`                 | API    | Frontend URL for CORS              |
| `PUBLIC_API_URL`             | API    | Public-facing API URL              |
| `NEXT_PUBLIC_API_URL`        | Web    | API URL for browser requests       |
| `NEXT_PUBLIC_SUPABASE_URL`   | Web    | Supabase URL for browser client    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web | Supabase anon key for browser      |

### Running Locally

```bash
# Apply migrations
supabase db push

# Terminal 1: API
cd api && pip install -r requirements.txt
uvicorn api.main:app --reload --port 5001

# Terminal 2: Worker
python -m api.worker

# Terminal 3: Frontend
cd web && npm install && npm run dev
```

### Production

- **API + Worker:** Deploy as separate processes (e.g. Railway, Fly.io, Docker)
- **Frontend:** Deploy to Vercel (`next build && next start`)
- **Database:** Supabase hosted project
- **Redis:** Upstash (serverless) or managed Redis

The API and worker share the same codebase but run as independent processes.
The worker is stateless and can be scaled horizontally by adding more
consumer instances to the same Redis consumer group.
