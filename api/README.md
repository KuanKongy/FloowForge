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
| Text    | `GPT o3-mini`          | Working         | Mapped to `gpt-4o-mini` on the OpenAI side.                                            |
| Text    | `GPT-4o-mini`          | Working         |                                                                                        |
| Text    | `Gemini 2.5 Flash`     | Working         | Normalized to `gemini-2.5-flash`. 2.0 / 1.5 ids are retired upstream and remap forward. |
| Text    | `Llama 3.1 (Cloudflare)` | Account-gated | `llama-3-8b` was deprecated 2026-05-30 (HTTP 410); all Llama labels map to `@cf/meta/llama-3.1-8b-instruct-fp8`. Needs Workers AI: Read+Edit on the token. |
| Image   | `GPT Image 1`          | Working         | `dall-e-3` was retired upstream, so the old `DALLE 3` label maps to `gpt-image-1`.      |
| Image   | `DreamShaper`          | Account-gated   | 401 from Cloudflare unless `@cf/lykon/dreamshaper-8-lcm` is enabled on the account.    |
| Image   | `Midjourney`           | No CF Workers AI mapping — falls back to Stable Diffusion XL. Manual configuration needed. |
| Audio   | `TTS-1`                | Working         | OpenAI text-to-speech.                                                                 |
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
2. **Model not enabled for the account**: a few image models (Stable Diffusion,
   Midjourney-equivalent SDXL Lightning, DreamShaper LCM) are gated. Visit
   Cloudflare Dashboard -> Workers AI -> Models, click the model, accept the
   terms / enable it for the account. If the model is deprecated, switch to
   `@cf/black-forest-labs/flux-1-schnell` (image) or
   `@cf/meta/llama-3-8b-instruct` (text), both of which are enabled by default
   for new accounts.

To override the default model id without code changes, save your own
Cloudflare API key on the **Integrations** page; the run engine uses your key
when a flow runs (so you can also expose private/beta models that the
platform key doesn't have access to).
