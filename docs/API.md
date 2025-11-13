# API

The API is a FastAPI service with route modules, an execution engine, provider
adapters, a Redis-backed worker, and an in-process scheduler.

## Entry Points

- `api/main.py`: creates the FastAPI app, configures CORS, registers routers,
  starts scheduler lifecycle hooks, and exposes health behavior.
- `api/config.py`: loads `.env` through Pydantic settings.
- `api/deps.py`: validates Supabase bearer tokens for authenticated routes.
- `api/db.py`: Supabase REST helpers used by routers, worker, and scheduler.
- `api/schemas.py`: Pydantic request and response contracts.

## Routers

- `routers/flows.py`: create, list, update, save versions, run, and expose flow
  graph data.
- `routers/runs.py`: list, filter, inspect, cancel, and delete run records.
- `routers/triggers.py`: create manual, webhook, and schedule triggers.
- `routers/custom_nodes.py`: prompt-template custom node CRUD.
- `routers/integrations.py`: user-owned provider credentials.
- `routers/media.py`: media upload and retrieval helpers.

## Engine

- `engine/executor.py`: orchestrates DAG execution and node lifecycle events.
- `engine/graph.py`: graph validation, adjacency, topo order, and scoped runs.
- `engine/context.py`: per-run execution context and event emission.
- `engine/nodes/*`: one executor module per node family.

Node executors are intentionally small. They should translate node data and
parent outputs into a provider call or pass-through result, then return a
normalized payload to the executor.

## Providers

- `providers/base.py`: common provider result shape.
- `providers/openai_provider.py`: OpenAI text, image, and audio.
- `providers/gemini_provider.py`: Gemini text. Legacy `Gemini 1.5 Flash`
  labels map to `gemini-2.5-flash-lite`.
- `providers/cloudflare_provider.py`: direct Cloudflare Workers AI text,
  image, and audio. Requires account id plus API token.
- `providers/deepseek_provider.py`: DeepSeek chat using the OpenAI-compatible
  API. Defaults to `deepseek-v4-flash`.
- `providers/__init__.py`: provider registry used by nodes.

## Background Work

- `queue.py`: enqueue run jobs.
- `worker.py`: consumes queued jobs and executes runs.
- `scheduler.py`: loads active schedule triggers and enqueues due runs.

Redis should be used in production. The inline fallback is useful for local
development and tiny demos, but it is not the recommended production path.

## Testing

Backend tests live in `api/tests/`:

- `test_graph.py`: graph utilities and validation.
- `test_executor.py`: run lifecycle and wait strategies.
- `test_nodes.py`: node behavior.
- `test_providers.py`: provider request/response contracts with HTTP stubs.
- `test_routers.py`: route behavior with faked Supabase access.

Run:

```bash
cd api
pip install -r requirements.txt
pytest tests -q
```
