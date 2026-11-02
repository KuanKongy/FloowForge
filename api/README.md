# FloowForge API

FastAPI service that backs FloowForge. Hosts:

- REST endpoints (`/flows`, `/runs`, `/triggers`, `/custom-nodes`, `/integrations`, `/media`)
- Public webhook trigger router (`/t/webhook/{token}`)
- APScheduler for cron triggers
- Redis Streams worker (`worker.py`) that runs the execution engine

## Local dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in Supabase + provider keys
# In one terminal:
uvicorn api.main:app --reload --port 5001
# In another:
python -m api.worker
# Redis must be running (e.g. `redis-server` or `docker run -p 6379:6379 redis`).
```

## Notes

- Auth: bearer must be the user's Supabase access token. [`deps.py`](deps.py)
  verifies the token against Supabase Auth's `/auth/v1/user` endpoint using
  your project URL and anon key. If `/flows` returns **401**, the browser is
  usually sending an expired session or the web/api env vars point at different
  Supabase projects. The API normalizes `SUPABASE_URL`, so either
  `https://<ref>.supabase.co` or `https://<ref>.supabase.co/rest/v1` will work,
  but the project root URL is still preferred.
- Runs are queued via Redis Streams. The worker calls
  [`engine/executor.py`](engine/executor.py) which broadcasts each
  `node_started` / `node_succeeded` / `node_failed` event to the Supabase
  Realtime channel `run:{run_id}` — the editor subscribes to this channel.
- Scheduler boots on app startup, loads active schedule triggers, and adds
  cron jobs that enqueue runs via Redis Streams.

## AI model status

Each AI Model node lets users pick a model from a friendly dropdown; the
backend normalizes the label to a real provider model id. Verified status
as of latest manual smoke test:

| AI type | Label                  | Status          | Notes                                                                                  |
| ------- | ---------------------- | --------------- | -------------------------------------------------------------------------------------- |
| Text    | `GPT-6 Luna`           | Working         | Mapped to `gpt-6-luna`. Legacy `GPT o3-mini` / `GPT-4o-mini` labels remap here (gpt-4o-mini shuts down 2027-01-14; o3-mini is already gone). gpt-6 rejects `temperature`, so the provider drops it. |
| Text    | `Gemini 3.1 Flash Lite` | Working        | Normalized to `gemini-3.1-flash-lite` ($0.25/$1.50 per 1M tokens; chosen over the pricier 3.5-lite and 3.x-flash tiers). Deprecated `Gemini 2.5 Flash` / `Gemini 2.5 Flash Lite` labels remap here. |
| Text    | `DeepSeek V4.1 Flash`  | Working         | Mapped to `deepseek-flash`, the only id DeepSeek sanctions for this tier; `deepseek-v4-flash` was retired 2026-09-10. |
| Text    | `Llama 3.1 (Cloudflare)` | Account-gated | `llama-3-8b` was deprecated 2026-05-30 (HTTP 410); the Llama labels map to `@cf/meta/llama-3.1-8b-instruct-fp8`. Needs Workers AI: Read+Edit on the token. |
| Image   | `GPT Image 2.5 Flare`  | Working         | Mapped to `gpt-image-2.5-flare` (fast default). `gpt-image-1` shut down 2026-10-23; the `GPT Image 1` label remaps here. |
| Image   | `GPT Image 2.5 Sunburst` | Working       | Mapped to `gpt-image-2.5-sunburst`: premium precision tier, slower, same price as Flare. |
| Image   | `DreamShaper`          | Account-gated   | 401 from Cloudflare unless `@cf/lykon/dreamshaper-8-lcm` is enabled on the account.    |
| Audio   | `GPT-4o Mini TTS`      | Working         | Mapped to `gpt-4o-mini-tts`; the `TTS-1` label remaps here. Heads-up: OpenAI retires the whole `/v1/audio/speech` endpoint 2027-01-06 in favor of the Realtime API (`gpt-realtime-2.1-mini`), which needs a code migration, not a model-id swap. |
| File    | `PDF`                  | Working         | Uses PyMuPDF server-side.                                                           |

Generated images and audio are uploaded to the public `run-media` Supabase
Storage bucket and the node returns the object URL. They used to be inlined as
base64 `data:` URLs, which exceeded the ~256 KB Supabase Realtime message limit
— the `node_succeeded` broadcast was rejected with 422 and the canvas silently
never rendered the result. The bucket is created on first upload, so no manual
provisioning is needed; `supabase/migrations/0002_run_media_bucket.sql` mirrors
it for projects built from SQL alone.

### When you see Cloudflare 401

Cloudflare Workers AI returns 401 for two distinct reasons; in both cases the
provider message gets surfaced in the editor's run sidebar:

1. **Token scope missing**: API token doesn't have *Workers AI: Read* + *Workers
   AI: Edit*. Open Cloudflare Dashboard -> My Profile -> API Tokens, edit the
   token, add both Workers AI scopes for the account, save.
2. **Model not enabled for the account**: a few image models (e.g. DreamShaper
   LCM) are gated. Visit Cloudflare Dashboard -> Workers AI -> Models, click
   the model, accept the terms / enable it for the account. If the model is
   deprecated, switch to `@cf/black-forest-labs/flux-1-schnell` (image) or
   `@cf/meta/llama-3.1-8b-instruct-fp8` (text), both of which are enabled by
   default for new accounts.

To override the default model id without code changes, save your own
Cloudflare API key on the **Integrations** page; the run engine uses your key
when a flow runs (so you can also expose private/beta models that the
platform key doesn't have access to).
