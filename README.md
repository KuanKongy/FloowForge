# FloowForge

A no-code AI workflow platform: drag-and-drop nodes on a canvas, save flows to your account, expose them via webhooks or schedules, and compose larger pipelines with subflows and prompt-template custom nodes.

FloowForge is the successor to Floowbox. The product is rebuilt on a server-side execution engine so flows can run from anywhere (manual button, public webhook, or cron) and stream live results back to the canvas.

## Layout

```
flowforge/
  web/                # Next.js 15 App Router (UI)
  api/                # FastAPI execution engine + REST API
  packages/shared/    # Shared TypeScript types (Flow, Node, Edge, RunEvent)
  supabase/           # SQL migrations and RLS policies
```

## Stack

- **Web:** Next.js 15, React 19, Tailwind v4, @xyflow/react 12, Supabase JS (Auth + Realtime), Framer Motion, wavesurfer.js
- **API:** FastAPI, Pydantic v2, httpx, Redis Streams worker, APScheduler, PyMuPDF, OpenAI/Gemini/Cloudflare Workers AI clients
- **Data:** Supabase (Postgres + Auth + Storage + Realtime)

## Quick start

1. Create a Supabase project, then apply the SQL in [`supabase/migrations`](supabase/migrations) via the Supabase SQL editor or CLI.
2. Copy [`api/.env.example`](api/.env.example) to `api/.env` and fill in keys.
3. Copy [`web/.env.example`](web/.env.example) to `web/.env.local` and fill in keys.
4. Start Redis locally (`redis-server`) for the job queue.
5. `pip install -r api/requirements.txt && uvicorn api.main:app --reload --port 5001` and in another terminal `python -m api.worker`.
6. `cd web && npm install && npm run dev`.

See each subdirectory's README for more details.

For a deeper technical map, start with [`docs/README.md`](docs/README.md).

## Features

- Email + Google OAuth via Supabase
- Saved flows with immutable versions, runs, and live per-node run state
- Triggers: manual, public webhook (`POST /t/webhook/{token}`), and cron schedules
- Multi-trigger flows: many Buttons / Webhook In / Manual In nodes per canvas. Clicking a button only fires its **downstream subgraph**; the rest of the canvas stays idle and visually dims.
- Per-node `wait_strategy` toggle (Barrier / Race) drives multi-parent join semantics. Barrier waits for all parents; Race fires on the first parent.
- Topological step badges live on every node so you can see what runs in parallel and what has to wait.
- Run sidebar with Gumloop-style per-node status + duration, expandable JSON payload, and total elapsed time.
- Floowbox-flavored UI: pink primary tokens, per-kind colored backend tiles, proximity-revealed handles, in-use direction dots, edge X delete badges, collapse/rename per node, framer-spring frontend/backend toggle.
- Custom nodes: subflows (use a saved flow as a node) and Prompt Template builder
- Built-in providers: OpenAI (chat + TTS + GPT Image 1), Google Gemini, Cloudflare Workers AI (Llama, DreamShaper, Flux), PDF text extraction
- Generated images/audio are stored in Supabase Storage and passed downstream as URLs, so results stay under the Realtime message limit and survive a page reload
- Inline-execution fallback: when no Redis worker is reachable the API runs flows in a FastAPI background task so dev / tests / small deployments stay functional without Redis.

## Testing

Backend tests cover the executor (8 scenarios), routers, providers, and graph utilities; they run on an in-memory Supabase fake.

```bash
cd api
pip install -r requirements.txt
pytest tests -q --count=5         # 31 tests x 5 iterations = 155 runs
```

Frontend has Vitest unit tests for the topo-order/scope utilities (used to drive badges and dimming):

```bash
cd web
npm install
npm test                          # vitest (8 tests)
npm run lint
npm run build
```

The Playwright e2e specs in `web/tests/e2e` exercise the full editor (sign-in -> create flow -> add nodes -> run -> sidebar -> cancel) and skip gracefully if `E2E_BASE_URL` is not set:

```bash
E2E_BASE_URL=http://localhost:3000 \
E2E_EMAIL=demo@flowforge.dev E2E_PASSWORD=... \
npm run e2e:ci                    # repeat-each=3 across the 5 scenarios
```

CI runs lint + unit tests + build for `web/` and `pytest --count=3` for `api/`.
