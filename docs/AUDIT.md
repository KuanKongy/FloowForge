# FlowForge Platform Audit

**Date:** 2026-07-29 · **Commit audited:** `ed2b5e8d` · **Auditor:** Claude (Fable 5)

Full-surface audit of the FlowForge platform: execution engine, providers, REST API,
public webhook/form surface, scheduler, worker, database/RLS, frontend editor, and
deployment. Every P0 and P1 finding below was verified by reading the source; where a
finding says **PROVEN** it was reproduced at runtime.

## Baseline (before any fix)

| Suite | Result | Docs claim |
|---|---|---|
| `pytest api/tests` | **61 passed** | README says 31 |
| `vitest` (`web`) | **11 passed** | README says 8 |
| Playwright e2e | never runs in CI; all specs self-skip | README describes 5 scenarios |
| API boot | clean against live Supabase; `runs.start_node_ids` present | — |

## Severity key

- **P0** — exploitable security hole or data leak across tenants.
- **P1** — engine/infra defect causing wrong results, hangs, or lost work.
- **P2** — a shipped feature does not do what it claims.
- **P3** — frontend bug, UX/a11y defect, or performance problem.
- **P4** — docs, deployment, CI.

## Scoreboard

| Severity | Count | Fixed |
|---|---|---|
| P0 | 14 | **14** |
| P1 | 15 | **15** |
| P2 | 8 | **8** |
| P3 | 30 | **26** |
| P4 | 9 | **9** |

Suite after Phase 5: **125 pytest** + **29 vitest** passing (baseline was 61 + 11),
`ruff check` clean, `tsc --noEmit` clean, `next build` clean.

> **Required deploy step.** Apply `supabase/migrations/0003_audit_fixes.sql` before
> running this build. It adds `runs.trigger_id` (which the public webhook and
> scheduler paths now write), the `deepseek` enum value, a `run_events` delete
> policy, and it makes the `run-media` bucket private. The API logs a warning at
> boot when the column is missing.

---

# P0 — Security

### S1. Jinja2 SSTI → remote code execution in the worker — **PROVEN**

`api/engine/nodes/prompt_template.py:22,85`

The prompt-template executor renders user-authored templates through a plain,
**non-sandboxed** `jinja2.Environment`. `template_str` comes from
`custom_nodes.body.prompt` or `node.data.body.prompt` — both fully user-controlled via
`POST /custom-nodes` and flow-version saves.

Reproduced against the real module:

```python
payload = "{{ cycler.__init__.__globals__.os.popen('echo PWNED-$(whoami)').read() }}"
_jinja.from_string(payload).render()   # -> "PWNED-saikou"
```

**Impact.** Arbitrary Python/shell execution inside the worker process, which holds
`SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS for *every* tenant) plus all provider API
keys. Any user who can sign up gets full multi-tenant compromise. This is the most
severe finding in the audit.

**Fix.** Use `jinja2.sandbox.SandboxedEnvironment`, catch `SecurityError` and report it
as a template error, keep `StrictUndefined`.

- [x] Fixed

### S2. IDOR — any user can steal any other user's webhook token

`api/routers/triggers.py:99-110`

`GET /triggers/{trigger_id}/webhook-info` authenticates the caller, then throws that
identity away: it queries `webhook_secrets` with `SupabaseClient.as_service()` (RLS
bypass) filtered **only** on `trigger_id`. The `user` parameter is never used.

**Impact.** Enumerate/guess a trigger id → receive its webhook token and URL → invoke a
stranger's flow at will, spending their AI budget and reading whatever the flow returns.

**Fix.** Query through `user.db` so RLS applies, or join `triggers` and assert
`user_id == user.id`; 404 otherwise.

- [x] Fixed

### S3. Public endpoint leaks private run outputs and errors

`api/routers/triggers.py:410-428`

`GET /t/webhook/{token}/runs/{run_id}` is unauthenticated and selects
`id,status,output,ended_at,error` with **no `show_outputs` check** — while its sibling
`/t/webhook/{token}/result/{run_id}` (`:443`) does gate on it. It also matches on
`flow_id` only, not on the run's originating trigger.

**Impact.** Anyone holding a public form link can read **every run of that flow**,
including the owner's private runs from the editor, plus raw `error` strings that embed
upstream provider and Supabase response bodies.

**Fix.** Gate on `show_outputs`; scope the lookup to runs actually created by that
trigger; never return raw `error` to unauthenticated callers.

- [x] Fixed

### S4. Cross-tenant flow execution via unvalidated `version_id`

`api/routers/runs.py:123-131`

`body.version_id` is written straight into `runs.flow_version_id` with no check that the
version belongs to the flow or the caller. The executor later loads that version with
the service role.

**Impact.** Supplying another tenant's `flow_version_id` executes their graph, and the
output is stored on a run owned by the attacker — readable through `GET /runs/{id}`.
Requires knowing the target UUID, which limits practical exploitability but is still
broken access control. The same handler dereferences `flow` without a null check, so a
missing/unowned flow yields a 500 instead of 404.

**Fix.** Verify the version belongs to `flow_id` and the flow belongs to `user.id`.

- [x] Fixed

### S5. Triggers can be attached to another tenant's flow

`api/routers/triggers.py:37-53`

`create_trigger` never verifies `body.flow_id` ownership. RLS on `triggers` only checks
`user_id`, which the handler sets to the caller — so the insert succeeds.

**Impact.** Attach a `public_form`/`webhook` trigger to a victim's `flow_id`; the public
webhook path then runs that flow with the service role and returns results.

**Fix.** Assert flow ownership through `user.db` before inserting.

- [x] Fixed

### S6. SSRF and cross-trigger output leak in outgoing callbacks

`api/engine/executor.py:585-620`

`_fire_callback` selects **every** trigger on the flow and POSTs the run output to each
one's `callback_url`, regardless of which trigger actually caused the run. The URL is
entirely user-supplied with no scheme/host validation, no DNS or private-IP check, and
no redirect policy; a 3-attempt retry loop amplifies it. `output_node_ids` is selected
but never used.

**Impact.** (a) Server-side request forgery from the worker — cloud metadata endpoints
(`169.254.169.254`), `localhost`, and internal services are all reachable. (b) A manual
run in the editor silently fires production webhooks with the output.

**Fix.** Fire only the trigger that caused the run; resolve DNS and reject
private/loopback/link-local targets; disable redirects; honour `output_node_ids`.

- [x] Fixed

### S7. Webhook secrets are generated but never verified

`api/routers/triggers.py:56-61,345`

A 32-byte `secret` is minted per webhook trigger, stored in `webhook_secrets`, returned
by the API and displayed in the UI — but **no endpoint ever reads it**. `hmac`,
`signature`, and `compare_digest` appear nowhere in the repository. The URL-path token is
the only credential, and it leaks through proxy logs, browser history, and `Referer`.
There is no rotation endpoint and no expiry.

**Fix.** Verify an `X-FlowForge-Signature` HMAC-SHA256 over the raw body using
`compare_digest`; sign outgoing callbacks with the same secret; add token rotation.
*(Breaking change — approved.)*

- [x] Fixed

### S8. BYO provider credentials stored in plaintext

`api/routers/integrations.py:34,57`

Credentials are `json.dumps()`'d into a column named `encrypted_credentials`. Nothing
encrypts them. The module docstring concedes this ("For production, wire pgsodium"),
`docs/DATABASE.md` describes the column as "encrypted or masked", and the UI shows a
shield icon reading "Existing keys are masked".

**Impact.** Any service-role compromise — including via S1 — yields every tenant's
OpenAI/Gemini/Cloudflare/DeepSeek keys in cleartext.

**Fix.** Encrypt at rest (pgsodium/Supabase Vault, or app-level AES-GCM keyed by a new
`CREDENTIALS_KEY` setting) with a migration to re-encrypt existing rows.
*(Breaking change — approved.)*

- [x] Fixed

### S9. `run-media` is a world-readable bucket with no expiry

`supabase/migrations/0002_run_media_bucket.sql:11-25`, `api/storage.py:103,160`

The bucket is created with `public = true` and a blanket policy
`for select using (bucket_id = 'run-media')` — no owner scoping, no TTL, no cleanup job.
Generated images and audio are served from unsigned URLs forever, and those URLs
propagate into `run_events.payload`, `runs.output`, callback bodies, and the public
result page. The migration itself acknowledges that security rests on UUID
unguessability.

**Fix.** Make the bucket private, serve time-limited signed URLs, scope the read policy
to the owner, and add a retention job.

- [x] Fixed

### S10. Realtime run channel is public

`web/components/editor/EditorClient.tsx:332-378`, `api/db.py:179-206`

The server broadcasts every node's inputs and outputs to topic `run:{run_id}` using the
service role key. The client subscribes with `supabase.channel("run:" + runId)` and no
`config.private`, so it is a public broadcast topic.

**Impact.** Anyone with the (public) anon key who learns or guesses a run UUID streams
another user's node inputs and outputs live.

**Fix.** Private channels with RLS-backed topic authorization.

- [x] Fixed

### S11. Public endpoints are unmetered and unbounded

`api/routers/triggers.py:345-372`, `api/utils/rate_limit.py:15`

`POST /t/webhook/{token}` has no rate limit, no signature, and no payload size cap —
`await request.body()` buffers the entire request before it is written to `runs.input`.
Rate limiting exists on exactly one authenticated endpoint (`POST /flows/{id}/runs`), is
in-process (`defaultdict(deque)`) so it is useless behind more than one replica, and
**never evicts keys**, making `_BUCKETS` an unbounded memory sink.

**Impact.** A leaked token allows unlimited runs against the owner's provider keys.
Without Redis, each request also spawns an uncapped background task in the API process.

**Fix.** Redis-backed limiter on all `/t/*` routes; enforce a body-size cap; evict idle
buckets.

- [x] Fixed

### S12. CORS permits `localhost:3000` in production

`api/main.py:85-91`

`allow_origins=[settings.WEB_ORIGIN, "http://localhost:3000"]` with
`allow_credentials=True` and wildcard methods/headers. An unset `WEB_ORIGIN` injects an
empty-string origin.

**Fix.** Build the origin list from settings; include localhost only in dev.

- [x] Fixed

### S13. Raw database error bodies returned to clients

`api/routers/runs.py:168-171`, `api/db.py:48`

PostgREST error text — including column and constraint names — is surfaced verbatim in
API responses (400 chars).

**Fix.** Log detail server-side, return a generic message.

- [x] Fixed

### S14. Missing security headers

`web/next.config.ts` defines no `headers()`: no CSP, HSTS, X-Frame-Options,
Referrer-Policy, or Permissions-Policy. The middleware matcher also excludes `/p/*`
entirely.

- [x] Fixed

---

# P1 — Execution engine and infrastructure

### E1. Race-node deadlock permanently stalls the worker

`api/engine/executor.py:347-379`

If **every** in-scope parent of a `race` node fails, `parents_ready` stays false (no
parent is in `outputs`), and the `wait_tasks` list comprehension yields nothing (every
parent is in `failed`). The code then awaits `asyncio.wait([cancel_task])`, which never
completes — `cancel_event` is only set *after* `gather` returns, and `gather` is waiting
on this very task.

The barrier branch handles this correctly at `:359`; the race branch does not.

**Impact.** The run hangs forever. Because the worker reads with `count=1` and awaits
each job sequentially, **one such run blocks the entire queue permanently**.

**Fix.** When all in-scope parents have terminally failed or been skipped, return
`(False, None)` so the node is skipped.

- [x] Fixed

### E2. Cancelling a queued run is silently undone

`api/engine/executor.py:249-254`

`run_flow` unconditionally writes `status: "running"`. A run cancelled while sitting in
the queue is flipped back to running and executes to completion; the watchdog then polls
and sees `running`, so it never stops.

**Fix.** Compare-and-set `queued → running`; abort if the run is already terminal.

- [x] Fixed

### E3. No idempotency guard against double execution

`api/engine/executor.py:210-254`

Nothing verifies the run is still `queued`. A redelivered message (XAUTOCLAIM) or a
second worker executes the same run concurrently — double provider spend and duplicate
events.

**Fix.** Same CAS as E2.

- [x] Fixed

### E4. Worker ACKs failed jobs; dead-lettering is unreachable code

`api/worker.py:108-117,145,154`

`_process_message` catches the exception from `run_flow`, logs it, and then `XACK`s and
`XDEL`s unconditionally — so a failed job is never retried and its run row is left
`running` forever with nothing to reconcile it. Separately, `retry_counts` is
initialised **inside** the reconnect loop and is only ever populated by
`_recover_pending`, so the `> MAX_RETRIES` check at `:154` can never be true.

Both behaviours directly contradict `ARCHITECTURE.md`, which claims "XACK + XDEL only
after run reaches terminal state" and "Dead-letter after 3 failed retries".

**Fix.** ACK only on terminal state; persist retry counts in Redis; reconcile stuck
`running` runs; run `_recover_pending` periodically rather than only at startup.

- [x] Fixed

### E5. No timeouts, and cancellation never interrupts work in flight

`api/engine/executor.py:517-527`, `api/providers/*`

Node tasks are never `.cancel()`ed, so a cancelled run keeps burning tokens until the
provider returns. There is no per-node or per-run timeout anywhere. OpenAI and DeepSeek
clients set no timeout (SDK default 600 s). The Gemini adapter wraps a sync call in
`asyncio.to_thread`, which cannot be cancelled at all — a hung request leaks a thread for
the process lifetime.

**Fix.** Per-node and per-run timeouts; cancel outstanding tasks on cancellation;
explicit client timeouts.

- [x] Fixed

### E6. Unbounded subflow recursion

`api/engine/nodes/subflow.py:45-72`

No depth limit and no cross-flow cycle detection. A flow that contains itself as a
subflow recurses until memory exhaustion, inserting a `runs` row per level.

**Fix.** Depth cap plus ancestry check via `parent_run_id`.

- [x] Fixed

### E7. Final output is nondeterministic

`api/engine/executor.py:461-466,556-562`

The result is "the last sink in `completion_order`", so independent sinks race to decide
`runs.output`. Worse, node types with no registered executor (`header` is declared in
`NodeType` but has none) are assigned `outputs[nid] = None` and appended to
`completion_order` — so a header node can win the race and null out the run's output.

**Fix.** Deterministic selection (topological rank, or the trigger's `output_node_ids`);
do not record unexecutable nodes as completions.

- [x] Fixed

### E8. One-shot cleanup deletes unrelated triggers

`api/engine/executor.py:623-643`

After a scheduled run, this deletes **every** `kind='schedule'` trigger on the flow whose
mode is `delay` or `once` — not just the one that fired. `scheduler.py:177-185`
separately deactivates the same trigger, so two mechanisms overlap.

**Fix.** Delete only the firing trigger; keep one mechanism.

- [x] Fixed

### E9. Every `single=True` 404 path is dead code

`api/db.py:104-118`

`select(single=True)` sets `Accept: application/vnd.pgrst.object+json`. PostgREST
returns **406** when zero rows match, so `_raise_with_supabase_body` raises and the
caller's `if not row: raise HTTPException(404, ...)` branch is never reached — users get
a 500 instead of a 404. Affects roughly ten call sites across `triggers.py`, `runs.py`,
`flows.py`, `executor.py`, and `prompt_template.py`.

No test catches this because the in-memory fake (`api/tests/conftest.py:104-106`) returns
`None` for the empty case, which is what the code expects but not what production does.

**Fix.** Return `None` on 406/`PGRST116`; add a test asserting 404 rather than 500.

- [x] Fixed

### E10. Graph validation is too broad; duplicate edges double-feed

`api/engine/graph.py:29-39,130`

A whole-flow run calls `topo_order` over all nodes, so a cycle in *any* disconnected
component — including one that would never execute — fails the entire run.
`parents_of` does not deduplicate, so two edges between the same pair feed the parent's
output twice.

- [x] Fixed

### E11. Input/metadata index skew corrupts chat roles

`api/engine/executor.py:413-427`

`add_input_from_parent` appends to `node_inputs` **before** the `if parent:` guard, so an
edge referencing a missing node adds a positional input with no matching `input_meta`
entry. `chat.py:45-48` indexes metadata by input position and therefore assigns the
wrong roles to messages.

**Fix.** Append to both lists inside the guard.

- [x] Fixed

### E12. Event emission is not best-effort

`api/engine/context.py:19-63`, `api/engine/executor.py:472-485`

`ctx.emit` awaits an unguarded `run_events` insert, and the `node_started` emit sits
*outside* the node's try/except. A transient PostgREST error therefore fails the node —
and the run — with a misleading error message. A failing `run_started` emit aborts a run
that is already marked `running`.

**Fix.** Make persistence best-effort: log failures, never propagate.

- [x] Fixed

### E13. Scheduler is unsafe for more than one replica

`api/scheduler.py:44,92-124`, `api/routers/triggers.py:71`

APScheduler runs in-process with no leader election, so every API replica loads all
active schedule triggers and fires **duplicate runs**. Conversely `add_trigger` and
`remove_trigger` only affect the replica that served the request, so schedules stay
inconsistent until restart. Invalid cron raises inside `create_trigger` *after* the row
is inserted (500 plus an orphan). `datetime.fromisoformat(once_at).replace(tzinfo=tz)`
discards any offset in the string, firing at the wrong instant for `...Z` or `+05:00`
inputs. No minimum interval is enforced (`* * * * *` and `interval_seconds: 1` are
accepted).

- [x] Fixed

### E14. Redis is probed once, and failures orphan runs

`api/main.py:60-71`, `api/routers/runs.py:43-51`, `api/queue.py:18-27`

Redis is pinged only at startup. If it is down at boot, `app.state.redis` stays `None`
for the process lifetime and every run — including public webhooks — executes inline in
the API process with no concurrency cap and its exception swallowed. If Redis dies later,
`stream_enqueue` raises **after** the run row is inserted, leaving orphaned `queued`
runs. `XADD` sets no `maxlen`, so with no worker consuming, the stream grows unbounded.

- [x] Fixed

### E15. A new TLS client per query

`api/db.py:115-175`, `api/providers/*`

Every select/insert/update/delete and every realtime broadcast constructs a fresh
`httpx.AsyncClient` — a full TLS handshake per call. `ExecutionContext.emit` performs two
serial round-trips per event on the hot path. Providers build a new client per BYO-key
call and never close it, leaking file descriptors in the long-lived worker.

**Fix.** Shared pooled clients.

- [x] Fixed

---

# P2 — Feature correctness

### F1. Public forms are broken for any form with fields

The public form is a headline feature and it does not deliver field values correctly.

Traced end to end:

1. `web/app/p/[token]/page.tsx:54,128` keys form state by the field's **display name** and
   posts `{"Prompt": "...", "Style": "..."}`.
2. `api/routers/triggers.py:271,328` derives fields — and keys `input_modes` — by
   **`node_id`**. Nothing maps names to node ids.
3. `api/engine/nodes/trigger_input.py:14-18` returns the *entire* payload dict to
   downstream nodes (`data.path` is never set by the UI).
4. `api/engine/nodes/passthrough.py:26-27` receives that one dict input and passes the
   whole thing through unchanged.

**Impact.** In a two-field form both nodes receive both values. Even a one-field form
feeds the model `{'Prompt': 'hello'}` instead of `hello`. Only the defaults-only path
(empty `{}` → falls back to the node's saved value) behaves correctly.

**Fix.** Key the submitted payload by `node_id` and have the executor route
`run_input[node_id]` to the matching input node. *(Breaking change — approved.)*

- [x] Fixed

### F2. DeepSeek integrations cannot be created

The DB enum is `provider_kind as enum ('openai', 'gemini', 'cloudflare')`
(`supabase/migrations/0001_init.sql:34-36`), while `api/schemas.py:141`,
`packages/shared/src/index.ts:178`, and the integrations UI all offer `deepseek`.
Creating one fails with a raw Postgres enum error.

**Fix.** Migration adding the enum value.

- [x] Fixed

### F3. Per-input `default` is silently discarded

The custom-node UI sends a `default` for each declared input, but `IoPort`
(`api/schemas.py:45`) does not declare the field, so Pydantic drops it. The executor's
fallback `spec.get("default")` (`api/engine/nodes/prompt_template.py:77`) is therefore
permanently dead.

- [x] Fixed

### F4. `update_trigger` can never clear a field

`api/routers/triggers.py:82` filters with `if v is not None`, so explicit nulls are
dropped and `callback_url`, `entry_node_id`, and saved input maps can never be cleared
through the API.

**Fix.** `model_dump(exclude_unset=True)`.

- [x] Fixed

### F5. Deleting run events is a silent no-op

`api/routers/runs.py:88` issues a user-scoped `DELETE` against `run_events`, which has
**SELECT-only** RLS (`run_events_owner_read`). Zero rows are deleted and PostgREST
returns 204. It only appears to work because deleting the run cascades.

- [x] Fixed

### F6. Version-number race on save

`api/routers/flows.py:80-84` reads the max version then writes `next_version`. Two
concurrent saves compute the same number and collide with `unique(flow_id, version)`,
surfacing as a 500.

- [x] Fixed

### F7. Provider adapter defects

`api/providers/*`

- ~~Temperature doubling~~ — **not a defect.** Verified the UI slider is 0–1
  (`AIModelNode.tsx:273`), so scaling to the providers' 0–2 range is intentional.
- Unknown model labels silently fall back to a **different provider** (`llm.py:51` → openai,
  `media.py:65` → cloudflare) instead of erroring — precisely the failure mode the last two
  commits were chasing.
- `result.data[0]` is unguarded (`openai:184`); an empty response raises `IndexError`
  instead of the intended message.
- Cloudflare coerces `int(width)`/`int(height)` from unvalidated node options — non-numeric
  raises, huge values cost money.
- Raw upstream bodies (500 chars) are embedded in exceptions that end up in `runs.error`,
  which is publicly readable (see S3).
- A missing `CLOUDFLARE_ID` produces `/accounts//ai/run/...` and a misleading 404.
- `chat.py` may emit a system message that adapters then prepend a second system message to.
- BYO-key paths construct a client per call and never close it (see E15).

- [x] Fixed

### F8. PDF parsing blocks the event loop

`api/routers/media.py:17-27` reads the whole upload before checking the 25 MB limit, then
runs `pymupdf.open`/`get_text` **synchronously on the event loop**, stalling every other
request for the duration. The endpoint is also unused by the web app, which inlines
base64 data URLs instead.

- [x] Fixed

---

# P3 — Frontend, UX, accessibility

### Auth and session

- `web/middleware.ts:221` — `getAuthState(request, !path.startsWith(PROTECTED_PREFIX))`
  **inverts** validation: `/app/*` is the only prefix that skips `validateSession()`. The
  real gate is `web/app/app/layout.tsx:7` (`getUser()`), so this is a defence-in-depth
  loss rather than an open door — but it wastes a Supabase round-trip on every public
  route and drops the `?next=` parameter when a session expires.
- `web/middleware.ts:36-39` — unguarded `process.env.NEXT_PUBLIC_SUPABASE_URL!` inside
  `new URL()`; a missing variable throws in the edge runtime, 500-ing `/`, `/auth/*`, and
  `/app/*` at once.
- `web/middleware.ts:103-131` — session cookies written without `secure`.
- `web/middleware.ts:144-185` — middleware rotates refresh tokens concurrently with the
  browser Supabase client: a classic dual-refresh race producing "Invalid Refresh Token"
  logouts.
- `web/lib/api.ts:22` — the module-level bearer-token cache is never invalidated on sign-out,
  so after switching accounts in one SPA session requests carry the previous token.
  No timeout, no retry, no 401 handling.

### Missing error and loading states

There is **no `error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere** in `web/app/`.
Combined with unguarded promise chains (`EditorClient.tsx:204`, `triggers/page.tsx:62`,
`custom-nodes/page.tsx:22`, `integrations/page.tsx:215`), a failed request renders a
*successful-looking* empty state — "No triggers yet", "This canvas is empty" — instead of
an error. `integrations` `submit()` has no `try/finally`, so a failed save disables the
button permanently.

### Editor state (`web/components/editor/EditorClient.tsx`)

- No dirty tracking, no autosave, no `beforeunload` guard, no undo/redo, no Cmd+S —
  navigating away silently discards all edits.
- `:719` — `fitView={nodes.length > 0}` is false at mount, so saved flows never fit the
  viewport (React Flow only honours it on init).
- `:383` — the realtime effect depends on a callback rebuilt on every `edges` change, so
  editing an edge mid-run tears down and re-subscribes the channel, losing events in the gap.
- `:492-512,659` — `runFlow()` is fired un-awaited and un-caught; a failure pins
  `isRunning` true forever with nothing surfaced to the user.
- `:214-232,278` — hydration snapshots `isFrontend`, so toggling mode during load leaves
  AI nodes `display:none` until toggled twice.
- `:689-694` — closing the run sidebar leaves `activeRunId` set and the channel subscribed,
  with no way to reopen.
- `:643` — no elapsed-time display while a run is in flight.
- `:451-474` — `buildGraphSnapshot` serialises FileNode's 25 MB base64 data URL into every
  version save.

### Node components (`web/components/editor/nodes/*`)

- Each node instance independently fetches `/integrations`, `/flows`, and `/custom-nodes`
  on mount — an N+1 request storm proportional to canvas size.
- `AIModelNode` never persists the defaulted `model`, and does not reset `integration_id`
  when the provider changes (stale wrong-provider id stays saved).
- `NodeHandleWrapper.tsx:85` — every node registers its own `window` mousemove listener
  performing `getBoundingClientRect()` plus four distance calculations per event.
- Collapse is dead code: `aria-label="Collapse node"` never renders for any node type.
- `AudioNode` passes CSS custom properties to a canvas renderer (wavesurfer cannot resolve
  them, so progress paints an invalid colour) and can double-destroy mid-fetch.
- `ImageNode` puts any value into `<img src>` with no type check or fallback, so an LLM
  string renders as a broken image.
- `TextNode`/`HeaderNode` call `updateNodeData` on every keystroke, re-rendering the canvas.

### Dashboard and triggers

- `app/app/page.tsx:269-303` — `nextCronTime` runs an unmemoized ~527,000-iteration loop
  allocating a `Date` per minute **during render**, per scheduled trigger. `cronMatches`
  mishandles `*/N` on 1-based fields (day-of-month `*/2` matches even days) and does not
  support step-in-range. The delay-schedule ETA clamps to one hour while the wizard
  defaults to thirty minutes.
- `app/app/page.tsx:51` sends `limit=10`, which the API ignores.
- `app/app/triggers/page.tsx:245,348` — the wizard seeds `flowId` from `flows[0]` before
  flows load, so **Create silently does nothing**.
- `:326-332` — minute/second clamps use `Math.min(60, …)`, permitting the invalid value 60.
- `:836-847` — the raw cron field renders for every schedule mode and silently overrides the
  mode's generated cron.
- `:727` — a previously saved dynamic input map can never be cleared.
- `:698-702` — clipboard writes are unguarded but always show "Copied ✓".
- `app/app/flows/page.tsx:103-114` — filtering everything out shows "No flows yet" instead
  of "no matches".

### Public pages

- `p/[token]/result/[runId]/page.tsx:37-56` — polls every 2 s with no maximum attempts and
  no backoff, and keeps polling after setting an error.
- `p/[token]/page.tsx:156-181` — file inputs push bare data-URL strings (unlike FileNode's
  `{kind:"file", mime, size, data_url}` shape), with no size limit and no required-field
  validation.
- Both public pages bypass `normalizeApiUrl`, so a trailing slash in `NEXT_PUBLIC_API_URL`
  produces `//t/webhook/…`.

### Accessibility and responsiveness

- `EditorTopBar.tsx:122-137` — the frontend/backend switch is a `<div role="switch">` with
  no `tabIndex` and no Enter/Space handler: not keyboard operable.
- `RunSidebar.tsx:222-229`, `ui/confirm-dialog.tsx:47-58` — `role="dialog"` sits on the
  click-to-close backdrop; no focus trap, no initial focus, no focus restore.
- `edges/DeletableEdge.tsx:43` — edge deletion is hover-only, unreachable by keyboard or
  touch.
- Dark-mode tokens exist in `globals.css:62-72` but are unreachable (no toggle,
  `defaultTheme="light"`), while `bg-white` is hardcoded in five places — enabling dark mode
  today would break those surfaces.
- The app is desktop-only: fixed 230 px sidebar, `w-[36em]`/`w-[40em]` nodes, no mobile
  breakpoint and no messaging.
- Landing page feature cards use `.card-surface`, whose hover transition is scoped to
  `a`/`button` in `globals.css:193` — so the declared animation never fires on these `div`s.

### Tests

- Every Playwright spec is broken by selector drift: `aria-label="Text"` versus the actual
  `"Text Box"` (`EditorPalette.tsx:49`), `/cancel run/i` versus `aria-label="Stop run"`, a
  `copy url` button with no accessible name, and `[aria-label="Collapse node"]` which never
  renders. One assertion is wrapped in `.catch(() => false)` so it silently no-ops.
- CI never runs Playwright at all, and every spec self-skips without `E2E_BASE_URL`.
- `web/tests/unit/` contains one file. No coverage for `lib/api.ts`, middleware cookie
  handling, `nextCronTime`/`cronMatches`, `buildGraphSnapshot`, or any component.

---

# P4 — Documentation, deployment, CI

| Claim | Location | Reality |
|---|---|---|
| Apply `0004_run_scope.sql` | `api/main.py:47`, `api/routers/runs.py:163`, `supabase/README.md` | File does not exist; only `000_nuke`, `0001_init`, `0002_run_media_bucket` |
| "SQL migrations (0001–0005)" | `ARCHITECTURE.md:38` | Two real migrations |
| "31 tests", "vitest (8 tests)", "5 scenarios" | `README.md:57,66,74` | 61 pytest, 11 vitest, 8 e2e tests that never run |
| "XACK + XDEL only after terminal state" | `ARCHITECTURE.md` | False — see E4 |
| "Dead-letter after 3 failed retries" | `ARCHITECTURE.md` | Unreachable code — see E4 |
| `filebox` = "PDF upload + text extraction" | `ARCHITECTURE.md` | It is an opaque passthrough; extraction is `fileparser` |
| "Uses pdfplumber server-side" | `api/README.md` | Code uses pymupdf |
| Node table omits `schedule_in`; env table omits `DEEPSEEK_API_KEY`; providers omit DeepSeek | `ARCHITECTURE.md` | All three exist |
| "integrations: encrypted or masked" | `docs/DATABASE.md` | Plaintext — see S8 |
| Redirects to `/app/flows` | `web/README.md` | Redirects to `/app` |

Additional:

- **Naming is split**: `FloowForge` ships in `README.md`, `api/main.py:83`, `api/worker.py:199`,
  `web/app/layout.tsx`, and `packages/shared`, while `docs/` and `ARCHITECTURE.md` say
  `FlowForge`. Commit `76dfb103` ("Name Fix") deliberately renamed product surfaces only.
- **Dockerfiles**: both `Dockerfile.api` and `Dockerfile.worker` run as **root**, have **no
  `HEALTHCHECK`** despite `/health` existing, and pin base images by floating tag.
- **CI** (`.github/workflows/ci.yml`): uses `npm install` rather than `npm ci` (lockfile not
  enforced), and runs no `tsc --noEmit`, no Docker build, no Playwright, no dependency or
  secret scanning.
- **Credentials on disk**: `api/.env` and `web/.env` hold live Supabase, OpenAI, Gemini,
  Cloudflare, DeepSeek, and Upstash credentials. They are correctly gitignored and
  dockerignored and never committed, but should be **rotated** before this project is
  published or shared.
- **Dependency freshness**: `api/requirements.txt` pins are from late 2024/early 2025;
  `google-genai==0.3.0` is a pre-1.0 SDK and the Gemini adapter already carries a
  retired-model remap table. `web/package.json` uses caret ranges with `npm install` in CI,
  so builds are not reproducible.

---

## Notes on test-suite blind spots

The in-memory Supabase fake aliases `as_user` to `as_service` (`api/tests/conftest.py:167-169`)
and `current_user` is dependency-overridden, so **no existing test exercises RLS, ownership,
or tenancy at all** — which is why S2, S4, and S5 went unnoticed. The fake also returns
`None` for empty `single=True` selects where production returns 406, which is why E9 is
invisible to the suite.

Also untested: the entire worker, the entire scheduler, `_fire_callback`,
`_cleanup_oneshot_trigger`, `prompt_template` (the RCE sink), subflow recursion, and every
public `/t/*` endpoint except the happy-path POST.
